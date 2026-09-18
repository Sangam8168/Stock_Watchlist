import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainSeverity, scopeOf } from './explain.ts';

test('scope mirrors the engine\'s own split — the thing the architecture rests on', () => {
  assert.equal(scopeOf('invalidation_breached'), 'thesis');
  assert.equal(scopeOf('entered_entry_zone'), 'thesis');
  assert.equal(scopeOf('abnormal_move'), 'symbol');
  assert.equal(scopeOf('new_52w_high'), 'symbol');
  assert.equal(scopeOf('stale_data'), 'data');
});

test('an abnormal move reconstructs the arithmetic that produced its score', () => {
  // 45 + min(35, (move - threshold) * 3) — the same formula detect.ts applies.
  const e = explainSeverity({ type: 'abnormal_move', severity: 63, data: { changePercent: -9, threshold: 3 } });
  assert.equal(e.factors.length, 2);
  assert.equal(e.factors[0].points, 45);
  assert.equal(e.factors[1].points, 18); // (9 - 3) * 3
  assert.equal(e.factors[0].points + e.factors[1].points, 63, 'explanation must equal the score');
  assert.match(e.factors[0].note, /3\.0% would be a normal day/);
});

test('the "how far past normal" term is capped, exactly as the engine caps it', () => {
  const e = explainSeverity({ type: 'abnormal_move', severity: 80, data: { changePercent: 40, threshold: 2 } });
  assert.equal(e.factors[1].points, 35, 'capped at 35, not 114');
});

test('a move barely over its threshold gets no second factor at all', () => {
  const e = explainSeverity({ type: 'abnormal_move', severity: 45, data: { changePercent: 3, threshold: 3 } });
  assert.equal(e.factors.length, 1);
  assert.equal(e.factors[0].points, 45);
});

test('a breached invalidation explains itself in the user\'s own terms', () => {
  const e = explainSeverity({ type: 'invalidation_breached', severity: 95, data: {} });
  assert.equal(e.scope, 'thesis');
  assert.equal(e.factors[0].points, 95);
  assert.match(e.factors[0].note, /prove you wrong/);
  assert.match(e.headline, /a level you set yourself/);
});

test('a catalyst gets louder as the date approaches', () => {
  const far = explainSeverity({ type: 'catalyst_imminent', severity: 58, data: { tradingDays: 4 } });
  const near = explainSeverity({ type: 'catalyst_imminent', severity: 67, data: { tradingDays: 1 } });
  assert.ok(near.factors[1].points > far.factors[1].points);
});

test('data problems are scoped apart, because they are never filtered as noise', () => {
  const e = explainSeverity({ type: 'stale_data', severity: 40, data: {} });
  assert.equal(e.scope, 'data');
  assert.match(e.headline, /never filtered out/);
});

test('an unknown event type still explains itself rather than rendering blank', () => {
  const e = explainSeverity({ type: 'something_new', severity: 41, data: {} });
  assert.equal(e.factors.length, 1);
  assert.equal(e.factors[0].points, 41);
  assert.equal(e.total, 41);
});

test('missing data never throws — an event with no data still explains', () => {
  const e = explainSeverity({ type: 'abnormal_move', severity: 45 });
  assert.ok(e.factors.length >= 1);
  assert.equal(Number.isFinite(e.factors[0].points), true);
});
