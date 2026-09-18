import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessConfidence, detectConflicts, confidenceLabel, POLL_SECONDS } from './confidence.ts';

const NOW = new Date('2026-09-17T15:00:00Z');
const ago = (s: number) => new Date(NOW.getTime() - s * 1000);
const base = { hasQuote: true, marketOpen: true, price: 100, week52High: 120, week52Low: 80 };

test('a quote inside one polling cycle is as fresh as this system can be', () => {
  const r = assessConfidence({ ...base, asOf: ago(POLL_SECONDS - 60) }, NOW);
  assert.equal(r.score, 1);
  assert.equal(r.band, 'live');
  assert.deepEqual(r.reasons, []);
});

test('the ladder steps down per missed cycle and floors at the coverage threshold', () => {
  const one = assessConfidence({ ...base, asOf: ago(POLL_SECONDS * 1.5) }, NOW);
  const two = assessConfidence({ ...base, asOf: ago(POLL_SECONDS * 2.5) }, NOW);
  const many = assessConfidence({ ...base, asOf: ago(POLL_SECONDS * 4) }, NOW);
  assert.equal(one.score, 0.8);
  assert.equal(two.score, 0.5);
  assert.equal(many.score, 0.25);
  // Same threshold coverage.ts uses to call itself blind — one policy, two surfaces.
  assert.equal(many.band, 'stale');
});

test('age is not held against a closed market — the last print is the price', () => {
  const r = assessConfidence({ ...base, marketOpen: false, asOf: ago(POLL_SECONDS * 20) }, NOW);
  assert.equal(r.score, 1);
  assert.equal(r.band, 'live');
});

test('no price at all is unusable, not merely stale', () => {
  const r = assessConfidence({ ...base, hasQuote: false, asOf: ago(10) }, NOW);
  assert.equal(r.score, 0);
  assert.equal(r.band, 'unusable');
});

test('a missing provider timestamp is itself a reason to doubt', () => {
  const r = assessConfidence({ ...base, asOf: null }, NOW);
  assert.equal(r.score, 0.5);
  assert.match(r.reasons[0], /no timestamp/);
});

test('clock skew ahead of now is clamped, never rewarded', () => {
  const r = assessConfidence({ ...base, asOf: new Date(NOW.getTime() + 60_000) }, NOW);
  assert.equal(r.ageSeconds, 0);
  assert.equal(r.score, 1);
});

test('a price above the 52-week high the provider also reports is a contradiction', () => {
  const c = detectConflicts({ ...base, asOf: null, price: 130, week52High: 120 });
  assert.equal(c.length, 1);
  assert.match(c[0], /above the 52-week high/);
});

test('a contradiction outranks age — one is old, the other cannot be true', () => {
  const r = assessConfidence({ ...base, asOf: ago(30), price: 130 }, NOW);
  assert.equal(r.score, 0.4);
  assert.equal(r.band, 'stale');
  assert.equal(r.conflicts.length, 1);
});

test('impossible ranges are caught in both directions', () => {
  assert.equal(detectConflicts({ ...base, asOf: null, week52High: 80, week52Low: 120 }).length > 0, true);
  assert.equal(detectConflicts({ ...base, asOf: null, dayHigh: 90, dayLow: 110 }).length > 0, true);
  assert.equal(detectConflicts({ ...base, asOf: null, price: 50, week52Low: 80 })[0], 'price is below the 52-week low the provider reports');
});

test('a surprising but self-consistent quote is news, not a conflict', () => {
  // Up hard, but every field agrees with every other field.
  const c = detectConflicts({ ...base, asOf: null, price: 119, dayHigh: 119, dayLow: 101, week52High: 120 });
  assert.deepEqual(c, []);
});

test('unconfirmed fields cap the score without pretending to average them away', () => {
  const r = assessConfidence({ ...base, asOf: ago(60), unconfirmedFields: ['peRatio'] }, NOW);
  assert.equal(r.score, 0.9);
  assert.match(r.reasons[0], /1 field could not be confirmed/);
});

test('every band has a label and a tone', () => {
  for (const b of ['live', 'delayed', 'stale', 'unusable'] as const) {
    const { label, tone } = confidenceLabel(b);
    assert.ok(label.length > 0 && tone.startsWith('text-'));
  }
});
