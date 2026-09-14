import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSurface, filterEvents, clampSensitivity, DEFAULT_PREFS } from './preferences.ts';

const move = (changePercent: number, threshold: number) => ({
  type: 'abnormal_move',
  data: { changePercent, threshold },
});

test('defaults surface everything', () => {
  for (const type of ['abnormal_move', 'news_break', 'invalidation_breached', 'new_52w_high']) {
    assert.equal(shouldSurface({ type, data: {} }, DEFAULT_PREFS), true, type);
  }
});

test('sensitivity scales the abnormal-move threshold', () => {
  const e = move(-6, 5); // a 6% move against a 5% threshold
  assert.equal(shouldSurface(e, { sensitivity: 1, tone: 'all' }), true, 'clears 5%');
  assert.equal(shouldSurface(e, { sensitivity: 1.5, tone: 'all' }), false, 'does not clear 7.5%');
  assert.equal(shouldSurface(e, { sensitivity: 0.5, tone: 'all' }), true, 'clears 2.5%');
});

test('sensitivity uses magnitude, so downside is treated like upside', () => {
  assert.equal(shouldSurface(move(-12, 5), { sensitivity: 2, tone: 'all' }), true);
  assert.equal(shouldSurface(move(12, 5), { sensitivity: 2, tone: 'all' }), true);
});

test('an abnormal move with no recorded threshold is never silently dropped', () => {
  // Older rows predate the threshold field; failing closed would hide real alerts.
  assert.equal(shouldSurface({ type: 'abnormal_move', data: {} }, { sensitivity: 3, tone: 'all' }), true);
  assert.equal(shouldSurface({ type: 'abnormal_move' }, { sensitivity: 3, tone: 'all' }), true);
});

test('signal tone keeps level-related events and drops market colour', () => {
  const p = { sensitivity: 1, tone: 'signal' as const };
  for (const t of ['entered_entry_zone', 'invalidation_breached', 'target_reached', 'catalyst_imminent']) {
    assert.equal(shouldSurface({ type: t }, p), true, `${t} must survive`);
  }
  for (const t of ['abnormal_move', 'news_break', 'new_52w_high', 'valuation_shift']) {
    assert.equal(shouldSurface({ type: t }, p), false, `${t} should be filtered`);
  }
});

test('data-quality events survive signal tone — a wrong number is never noise', () => {
  const p = { sensitivity: 1, tone: 'signal' as const };
  assert.equal(shouldSurface({ type: 'stale_data' }, p), true);
  assert.equal(shouldSurface({ type: 'corporate_action' }, p), true);
});

test('sensitivity is clamped to a sane range', () => {
  assert.equal(clampSensitivity(0.1), 0.5);
  assert.equal(clampSensitivity(99), 3);
  assert.equal(clampSensitivity(NaN), 1);
  assert.equal(clampSensitivity(undefined), 1);
  assert.equal(clampSensitivity('2'), 1, 'non-numbers fall back to the default');
});

test('filterEvents applies the same rule across a list', () => {
  const events = [move(-6, 5), { type: 'invalidation_breached' }, { type: 'news_break' }];
  assert.equal(filterEvents(events, { sensitivity: 2, tone: 'all' }).length, 2, 'drops the small move');
  assert.equal(filterEvents(events, { sensitivity: 1, tone: 'signal' }).length, 1, 'keeps only the level event');
});
