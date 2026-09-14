import test from 'node:test';
import assert from 'node:assert/strict';
import { extractThesisLocally as parse } from './parse-thesis.ts';

test('extracts the canonical phrasing end to end', () => {
  const r = parse('thinking NVDA is a buy under 130, out if it breaks 110, target 160 by earnings');
  assert.equal(r.entryHigh, 130);
  assert.equal(r.entryLow, 123.5, '"under X" becomes a small band below X');
  assert.equal(r.invalidationPrice, 110);
  assert.equal(r.targetPrice, 160);
  assert.equal(r.catalystNote, 'earnings');
  assert.equal(r.direction, 'long');
});

test('handles an explicit entry range', () => {
  for (const s of ['buy between 120 and 130', 'buy 120-130', 'entry 120 to 130']) {
    const r = parse(`${s}, stop 100, target 200`);
    assert.equal(r.entryLow, 120, s);
    assert.equal(r.entryHigh, 130, s);
  }
});

test('reads shorts and inverts the sanity checks', () => {
  const r = parse('short TSLA around 400, stop loss 450, target 300');
  assert.equal(r.direction, 'short');
  assert.equal(r.invalidationPrice, 450, 'a short is wrong when price rises');
  assert.equal(r.targetPrice, 300);
});

test('parses currency symbols, decimals and thousands separators', () => {
  const r = parse('buy at $1,305.50, stop $1,200, target $1,800');
  assert.equal(r.entryHigh, 1305.5);
  assert.equal(r.invalidationPrice, 1200);
  assert.equal(r.targetPrice, 1800);
});

test('drops an incoherent level rather than feeding the engine nonsense', () => {
  // For a long, invalidation above entry is a misparse — the engine would fire
  // "thesis broken" immediately.
  const r = parse('buy at 100, stop 150');
  assert.equal(r.entryHigh, 100);
  assert.equal(r.invalidationPrice, null, 'impossible level must be discarded');
});

test('drops a target on the wrong side of entry', () => {
  const r = parse('buy at 100, target 50');
  assert.equal(r.targetPrice, null);
});

test('returns nulls rather than guessing when there is nothing to find', () => {
  const r = parse('I like this company a lot');
  assert.equal(r.entryLow, null);
  assert.equal(r.invalidationPrice, null);
  assert.equal(r.targetPrice, null);
  assert.deepEqual(r.found.filter((f) => f !== 'direction'), []);
});

test('empty and whitespace input is safe', () => {
  for (const s of ['', '   ', '\n']) {
    const r = parse(s);
    assert.deepEqual(r.found, []);
  }
});

test('reports which fields were found, for honest UI feedback', () => {
  const r = parse('buy under 130, target 160');
  assert.ok(r.found.includes('entryHigh'));
  assert.ok(r.found.includes('targetPrice'));
  assert.ok(!r.found.includes('invalidationPrice'));
});
