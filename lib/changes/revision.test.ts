import test from 'node:test';
import assert from 'node:assert/strict';
import { diffThesis, describeChange, isLoosening } from './revision.ts';

test('an identical save produces no revision', () => {
  const t = { entryLow: 100, entryHigh: 110, invalidationPrice: 90, thesis: 'Buy the dip' };
  assert.deepEqual(diffThesis(t, { ...t }), []);
});

test('re-saving an unchanged date is not an edit', () => {
  // A Date and its ISO string are the same decision.
  const a = { catalystDate: new Date('2026-09-09T00:00:00.000Z') };
  const b = { catalystDate: '2026-09-09T00:00:00.000Z' };
  assert.deepEqual(diffThesis(a, b), []);
});

test('empty string and null are the same absence', () => {
  assert.deepEqual(diffThesis({ thesis: '' }, { thesis: null }), []);
  assert.deepEqual(diffThesis({ catalystNote: '  ' }, { catalystNote: null }), []);
});

test('reports each changed field with from and to', () => {
  const d = diffThesis({ invalidationPrice: 100, targetPrice: 150 }, { invalidationPrice: 90, targetPrice: 150 });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], { field: 'invalidationPrice', from: 100, to: 90 });
});

test('setting and clearing a level both register', () => {
  assert.deepEqual(diffThesis({ targetPrice: null }, { targetPrice: 200 }), [
    { field: 'targetPrice', from: null, to: 200 },
  ]);
  assert.deepEqual(diffThesis({ targetPrice: 200 }, { targetPrice: null }), [
    { field: 'targetPrice', from: 200, to: null },
  ]);
});

test('describeChange renders money and absence readably', () => {
  assert.equal(describeChange({ field: 'invalidationPrice', from: 100, to: 90 }), 'Invalidation: $100 → $90');
  assert.equal(describeChange({ field: 'targetPrice', from: null, to: 200 }), 'Target: — → $200');
});

test('detects a stop being widened — the goalpost-moving failure mode', () => {
  // Long: lowering invalidation gives the thesis more room to be wrong.
  assert.equal(isLoosening({ field: 'invalidationPrice', from: 100, to: 90 }, 'long'), true);
  assert.equal(isLoosening({ field: 'invalidationPrice', from: 90, to: 100 }, 'long'), false, 'tightening is fine');
  // Short inverts.
  assert.equal(isLoosening({ field: 'invalidationPrice', from: 100, to: 110 }, 'short'), true);
  assert.equal(isLoosening({ field: 'invalidationPrice', from: 110, to: 100 }, 'short'), false);
});

test('only invalidation counts as loosening', () => {
  assert.equal(isLoosening({ field: 'targetPrice', from: 200, to: 150 }, 'long'), false);
  assert.equal(isLoosening({ field: 'invalidationPrice', from: null, to: 90 }, 'long'), false, 'setting it fresh is not loosening');
});
