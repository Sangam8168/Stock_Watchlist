import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, thesisHealth, healthBand, type HealthInput } from './health.ts';

const base = (over: Partial<HealthInput> = {}): HealthInput => ({
  symbol: 'NVDA', distanceToEntryPct: null, invalidationPrice: null, targetPrice: null,
  entryLow: null, entryHigh: null, price: null, direction: 'long',
  daysSinceReview: 0, events: [], ...over,
});

test('an item with no levels cannot be judged', () => {
  assert.equal(classify(base()), 'unset');
});

test('a recorded invalidation breach outranks every other state', () => {
  // Also at target, also in zone — broken still wins, because it needs a decision.
  const e = base({
    entryLow: 100, entryHigh: 110, targetPrice: 150, price: 150,
    distanceToEntryPct: 0, events: [{ type: 'invalidation_breached' }],
  });
  assert.equal(classify(e), 'broken');
});

test('a breach that predates the app is caught by comparing price to the level', () => {
  // No event recorded, but price is already through invalidation.
  assert.equal(classify(base({ invalidationPrice: 100, price: 90 })), 'broken');
  // Short inverts: breach is price rising through the level.
  assert.equal(classify(base({ invalidationPrice: 100, price: 110, direction: 'short' })), 'broken');
  assert.equal(classify(base({ invalidationPrice: 100, price: 90, direction: 'short' })), 'watching');
});

test('target detection is direction-aware', () => {
  assert.equal(classify(base({ targetPrice: 150, price: 150 })), 'at-target');
  assert.equal(classify(base({ targetPrice: 50, price: 50, direction: 'short' })), 'at-target');
  assert.equal(classify(base({ targetPrice: 50, price: 60, direction: 'short' })), 'watching');
});

test('proximity and staleness classify the quiet cases', () => {
  assert.equal(classify(base({ entryLow: 100, entryHigh: 110, distanceToEntryPct: 0 })), 'in-zone');
  assert.equal(classify(base({ entryLow: 100, entryHigh: 110, distanceToEntryPct: -8 })), 'approaching');
  assert.equal(classify(base({ entryLow: 100, entryHigh: 110, distanceToEntryPct: -40 })), 'watching');
  assert.equal(classify(base({ entryLow: 100, entryHigh: 110, daysSinceReview: 31 })), 'stale');
});

test('an empty watchlist scores null rather than zero', () => {
  const r = thesisHealth([]);
  assert.equal(r.score, null, 'no data must not look like a bad score');
  assert.equal(r.tracked, 0);
});

test('a healthy list scores high and a broken one scores low', () => {
  const healthy = thesisHealth([
    base({ symbol: 'A', entryLow: 1, entryHigh: 2, distanceToEntryPct: 0 }),
    base({ symbol: 'B', targetPrice: 10, price: 10 }),
  ]);
  const broken = thesisHealth([
    base({ symbol: 'A', invalidationPrice: 100, price: 90 }),
    base({ symbol: 'B', invalidationPrice: 100, price: 90 }),
  ]);
  assert.ok(healthy.score! >= 90, `expected healthy, got ${healthy.score}`);
  assert.equal(broken.score, 0);
  assert.ok(healthy.score! > broken.score!);
});

test('broken theses are weighted heavily enough to drag a good list down', () => {
  const mixed = thesisHealth([
    base({ symbol: 'A', entryLow: 1, entryHigh: 2, distanceToEntryPct: -40 }),
    base({ symbol: 'B', entryLow: 1, entryHigh: 2, distanceToEntryPct: -40 }),
    base({ symbol: 'C', invalidationPrice: 100, price: 90 }),
  ]);
  // Two quiet (70) and one broken (0, double weight) → below the quiet baseline.
  assert.ok(mixed.score! < 50, `one break should dominate, got ${mixed.score}`);
});

test('reasons lead with what needs a decision', () => {
  const r = thesisHealth([
    base({ symbol: 'A', invalidationPrice: 100, price: 90 }),
    base({ symbol: 'B' }),
  ]);
  assert.match(r.reasons[0], /broken/);
  assert.deepEqual(r.states.broken, ['A']);
  assert.deepEqual(r.states.unset, ['B']);
});

test('bands cover the whole range including no-data', () => {
  assert.equal(healthBand(null).label, 'No data');
  assert.equal(healthBand(95).label, 'Healthy');
  assert.equal(healthBand(70).label, 'Holding up');
  assert.equal(healthBand(45).label, 'Needs work');
  assert.equal(healthBand(10).label, 'Under pressure');
});
