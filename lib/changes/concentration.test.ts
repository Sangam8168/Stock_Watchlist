import test from 'node:test';
import assert from 'node:assert/strict';
import { concentration } from './concentration.ts';

const s = (sector: string | null, marketValue: number | null = null) => ({ sector, marketValue });

test('an empty list scores nothing rather than zero-as-a-judgement', () => {
  const r = concentration([]);
  assert.equal(r.tracked, 0);
  assert.equal(r.verdict, null);
  assert.deepEqual(r.slices, []);
});

test('an evenly spread list scores near zero', () => {
  const r = concentration([s('Tech'), s('Energy'), s('Health'), s('Finance'), s('Retail')]);
  assert.equal(r.score, 0, 'perfectly even should be 0');
  assert.match(r.verdict!, /spread/);
});

test('a single-sector list is maximally concentrated', () => {
  const r = concentration([s('Tech'), s('Tech'), s('Tech'), s('Tech'), s('Tech')]);
  assert.equal(r.score, 100);
  assert.match(r.verdict!, /Over half/);
});

test('weights by position value when sizes are known', () => {
  // Two names, but almost all the money is in one.
  const r = concentration([s('Tech', 95000), s('Energy', 5000)]);
  assert.equal(r.top!.label, 'Tech');
  assert.ok(r.top!.valuePct! > 94, 'value share should dominate the count share');
});

test('falls back to count when nothing is sized', () => {
  const r = concentration([s('Tech'), s('Tech'), s('Energy')]);
  assert.equal(r.top!.label, 'Tech');
  assert.equal(r.top!.valuePct, null);
  assert.ok(Math.abs(r.top!.pct - 66.67) < 0.1);
});

test('missing sectors are grouped, not dropped', () => {
  const r = concentration([s('Tech'), s(null), s('  ')]);
  const unknown = r.slices.find((x) => x.label === 'Uncategorised');
  assert.equal(unknown?.count, 2);
  assert.equal(r.tracked, 3);
});

test('a short list gets no verdict — it would be noise dressed as insight', () => {
  assert.equal(concentration([s('Tech'), s('Tech')]).verdict, null);
  assert.ok(concentration([s('Tech'), s('Tech'), s('Tech'), s('Tech'), s('Tech')]).verdict);
});

test('slices are ordered biggest first', () => {
  const r = concentration([s('A'), s('B'), s('B'), s('C'), s('C'), s('C')]);
  assert.deepEqual(r.slices.map((x) => x.label), ['C', 'B', 'A']);
});

test('a single currency still weights by value', () => {
  const r = concentration([
    { sector: 'Tech', marketValue: 9000, currency: 'USD' },
    { sector: 'Tech', marketValue: 1000, currency: 'USD' },
    { sector: 'Energy', marketValue: 1000, currency: 'USD' },
    { sector: 'Banks', marketValue: 1000, currency: 'USD' },
    { sector: 'Pharma', marketValue: 1000, currency: 'USD' },
  ]);
  assert.ok(r.slices.some((s) => s.valuePct != null), 'value weighting should be on');
  assert.equal(r.slices[0].label, 'Tech');
  assert.ok(r.slices[0].valuePct! > 70, 'Tech dominates by value');
});

test('mixed currencies fall back to count, never sum rupees onto dollars', () => {
  // Without the guard the ₹ figure is ~83x the $ one for comparable real value,
  // so Pharma would appear to be the whole portfolio.
  const r = concentration([
    { sector: 'Tech', marketValue: 200, currency: 'USD' },
    { sector: 'Tech', marketValue: 200, currency: 'USD' },
    { sector: 'Tech', marketValue: 200, currency: 'USD' },
    { sector: 'Tech', marketValue: 200, currency: 'USD' },
    { sector: 'Pharma', marketValue: 8208, currency: 'INR' },
  ]);
  assert.ok(r.slices.every((s) => s.valuePct == null), 'value weighting must be disabled');
  const tech = r.slices.find((s) => s.label === 'Tech')!;
  assert.equal(tech.pct, 80, '4 of 5 names by count');
  assert.equal(r.slices[0].label, 'Tech', 'the rupee holding must not swamp the chart');
});

test('an unpriced list is unaffected by the currency rule', () => {
  const r = concentration([
    { sector: 'Tech', marketValue: null, currency: 'USD' },
    { sector: 'Tech', marketValue: null, currency: 'INR' },
    { sector: 'Energy', marketValue: null, currency: null },
    { sector: 'Banks', marketValue: null },
    { sector: 'Pharma', marketValue: null },
  ]);
  assert.ok(r.slices.every((s) => s.valuePct == null));
  assert.equal(r.tracked, 5);
});
