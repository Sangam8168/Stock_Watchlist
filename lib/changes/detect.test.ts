import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectChanges,
  abnormalMoveThreshold,
  volatilityFromChanges,
  type SnapshotLike,
  type ThesisLike,
} from './detect.ts';

const baseThesis: ThesisLike = {
  symbol: 'NVDA',
  company: 'NVIDIA',
  category: 'active',
  entryLow: 850,
  entryHigh: 880,
  invalidationPrice: 800,
  targetPrice: 1000,
  notify: true,
};

const snap = (over: Partial<SnapshotLike> = {}): SnapshotLike => ({
  symbol: 'NVDA',
  asOf: '2026-09-06T14:00:00.000Z',
  stale: false,
  price: 900,
  changePercent: 0.5,
  week52High: 1050,
  week52Low: 600,
  peRatio: 55,
  ...over,
});

test('entered_entry_zone fires only on the crossing in', () => {
  const changes = detectChanges(snap({ price: 900 }), snap({ price: 870 }), baseThesis);
  const hit = changes.find((c) => c.type === 'entered_entry_zone');
  assert.ok(hit, 'should detect entry');
  assert.equal(hit!.severity, 80);

  // Already inside on both sides → no repeat.
  const none = detectChanges(snap({ price: 865 }), snap({ price: 870 }), baseThesis);
  assert.equal(none.find((c) => c.type === 'entered_entry_zone'), undefined);
});

test('invalidation_breached fires when price falls through the level', () => {
  const changes = detectChanges(snap({ price: 820 }), snap({ price: 790 }), baseThesis);
  const hit = changes.find((c) => c.type === 'invalidation_breached');
  assert.ok(hit);
  assert.equal(hit!.severity, 95);
});

test('target_reached fires when price crosses up through target', () => {
  const changes = detectChanges(snap({ price: 980 }), snap({ price: 1010 }), baseThesis);
  assert.ok(changes.some((c) => c.type === 'target_reached'));
});

test('short bias flips invalidation and target directions', () => {
  const short: ThesisLike = {
    symbol: 'XYZ',
    company: 'XYZ Corp',
    direction: 'short',
    invalidationPrice: 110, // thesis wrong if price rises through 110
    targetPrice: 80, // profit target below
  };
  // Long-style logic (price below invalidation) must NOT fire for a short.
  const noBreak = detectChanges(snap({ price: 105 }), snap({ price: 95 }), short);
  assert.equal(noBreak.some((c) => c.type === 'invalidation_breached'), false);

  // Price rising through 110 breaks the short's invalidation.
  const broke = detectChanges(snap({ price: 108 }), snap({ price: 112 }), short);
  assert.ok(broke.some((c) => c.type === 'invalidation_breached'));

  // Price falling through 80 hits the short's target.
  const hitTarget = detectChanges(snap({ price: 85 }), snap({ price: 78 }), short);
  assert.ok(hitTarget.some((c) => c.type === 'target_reached'));
});

test('abnormal_move thresholds scale with volatility but floor at 5%', () => {
  // Floor: quiet stock or no stats → 5%.
  assert.equal(abnormalMoveThreshold(null), 5);
  assert.equal(abnormalMoveThreshold({ meanAbsChangePct: 0.5, stdevChangePct: 0.6, samples: 30 }), 5);
  // Volatile stock → mean|Δ| + 2·stdev.
  assert.equal(abnormalMoveThreshold({ meanAbsChangePct: 3, stdevChangePct: 4, samples: 30 }), 11);
});

test('abnormal_move fires for a big move in market hours, is suppressed when closed', () => {
  const quietVol = volatilityFromChanges([0.4, -0.5, 0.3, -0.2, 0.6, -0.4, 0.5]);

  const open = detectChanges(snap(), snap({ changePercent: -7 }), baseThesis, { volatility: quietVol, marketOpen: true });
  assert.ok(open.some((c) => c.type === 'abnormal_move'));

  const closed = detectChanges(snap(), snap({ changePercent: -7 }), baseThesis, { volatility: quietVol, marketOpen: false });
  assert.equal(closed.some((c) => c.type === 'abnormal_move'), false);

  // A 6% drop is below a volatile name's own threshold (11%) → not flagged.
  const volatile = { meanAbsChangePct: 3, stdevChangePct: 4, samples: 30 };
  const quietForThisName = detectChanges(snap(), snap({ changePercent: -6 }), baseThesis, { volatility: volatile, marketOpen: true });
  assert.equal(quietForThisName.some((c) => c.type === 'abnormal_move'), false);
});

test('catalyst_imminent uses the injected trading-day counter and fires within 5 days', () => {
  const changes = detectChanges(snap(), snap({ nextEarningsDate: '2026-09-11' }), baseThesis, {
    tradingDaysUntil: () => 3,
  });
  const hit = changes.find((c) => c.type === 'catalyst_imminent');
  assert.ok(hit);
  assert.ok(hit!.severity > 55);

  const far = detectChanges(snap(), snap({ nextEarningsDate: '2026-12-01' }), baseThesis, {
    tradingDaysUntil: () => 40,
  });
  assert.equal(far.some((c) => c.type === 'catalyst_imminent'), false);
});

test('news_break needs both a hash change and more articles', () => {
  const prev = snap({ newsHash: 'aaa', newsCount: 2 });
  const grew = detectChanges(prev, snap({ newsHash: 'bbb', newsCount: 4, topHeadline: 'NVIDIA lands new deal' }), baseThesis);
  assert.ok(grew.some((c) => c.type === 'news_break'));

  const reshuffled = detectChanges(prev, snap({ newsHash: 'bbb', newsCount: 2 }), baseThesis);
  assert.equal(reshuffled.some((c) => c.type === 'news_break'), false);
});

test('suspected split suppresses price signals and flags a corporate action', () => {
  // 10:1 split: $900 -> $90. Without the guard this would fire invalidation + abnormal move.
  const split = detectChanges(snap({ price: 900 }), snap({ price: 90, changePercent: -90 }), baseThesis, {
    marketOpen: true,
    volatility: volatilityFromChanges([0.4, -0.5, 0.3, -0.2, 0.6, -0.4, 0.5]),
  });
  assert.ok(split.some((c) => c.type === 'corporate_action'));
  assert.equal(split.some((c) => c.type === 'invalidation_breached'), false);
  assert.equal(split.some((c) => c.type === 'abnormal_move'), false);
  assert.equal(split.some((c) => c.type === 'new_52w_low'), false);

  // A normal -6% day is untouched.
  const normal = detectChanges(snap({ price: 900 }), snap({ price: 846, changePercent: -6 }), baseThesis, { marketOpen: true });
  assert.equal(normal.some((c) => c.type === 'corporate_action'), false);
});

test('stale_data always surfaces a low-severity event', () => {
  const changes = detectChanges(snap(), snap({ stale: true }), baseThesis);
  const hit = changes.find((c) => c.type === 'stale_data');
  assert.ok(hit);
  assert.ok(hit!.severity < 20);
});

test('dedupeKeys are stable within a day so the same change is not re-logged', () => {
  const a = detectChanges(snap({ price: 900 }), snap({ price: 870, asOf: '2026-09-06T14:00:00Z' }), baseThesis);
  const b = detectChanges(snap({ price: 901 }), snap({ price: 869, asOf: '2026-09-06T19:30:00Z' }), baseThesis);
  const ka = a.find((c) => c.type === 'entered_entry_zone')!.dedupeKey;
  const kb = b.find((c) => c.type === 'entered_entry_zone')!.dedupeKey;
  assert.equal(ka, kb);
});

test('no prior snapshot: only unconditional signals fire, no false crossings', () => {
  const changes = detectChanges(null, snap({ price: 870, stale: true }), baseThesis, { marketOpen: true });
  // Entry "crossing" needs a prior outside price; with none we don't invent one.
  assert.equal(changes.some((c) => c.type === 'entered_entry_zone'), false);
  assert.ok(changes.some((c) => c.type === 'stale_data'));
});
