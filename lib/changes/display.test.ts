import test from 'node:test';
import assert from 'node:assert/strict';
import { severityTier, proximityBucket, fmtDelta, fmtPct, fmtMarketCap, timeAgo } from './display.ts';

test('severity maps to the tier that drives every colour in the UI', () => {
  assert.equal(severityTier(95), 'critical');
  assert.equal(severityTier(90), 'critical', 'boundary is inclusive');
  assert.equal(severityTier(89), 'act');
  assert.equal(severityTier(70), 'act');
  assert.equal(severityTier(69), 'review');
  assert.equal(severityTier(50), 'review');
  assert.equal(severityTier(49), 'fyi');
  assert.equal(severityTier(0), 'fyi');
});

test('proximity buckets drive review cadence, so boundaries matter', () => {
  assert.equal(proximityBucket({ distanceToEntryPct: 0 }), 'in-zone');
  assert.equal(proximityBucket({ distanceToEntryPct: -10 }), 'near');
  assert.equal(proximityBucket({ distanceToEntryPct: 10 }), 'near', 'sign must not matter');
  assert.equal(proximityBucket({ distanceToEntryPct: -10.1 }), 'watching');
  assert.equal(proximityBucket({ distanceToEntryPct: 25 }), 'watching');
  assert.equal(proximityBucket({ distanceToEntryPct: 25.1 }), 'far');
  assert.equal(proximityBucket({ distanceToEntryPct: null }), 'no-levels');
});

test('fmtDelta renders each value kind, and nulls as an em dash', () => {
  assert.equal(fmtDelta(null, 'price'), '—');
  assert.equal(fmtDelta(163.5, 'price'), '$163.50');
  assert.equal(fmtDelta(-8.25, 'percent'), '-8.3%');
  assert.equal(fmtDelta(4.2, 'percent'), '+4.2%', 'positive percents are signed');
  assert.equal(fmtDelta(24.35, 'ratio'), '24.4');
  assert.equal(fmtDelta(63, 'plain'), '63');
});

test('formatters survive null, NaN and Infinity rather than printing them', () => {
  for (const bad of [null, undefined, NaN, Infinity, -Infinity]) {
    assert.equal(fmtPct(bad as number), '—');
    assert.equal(fmtMarketCap(bad as number), '—');
  }
});

test('market cap scales into T/B/M', () => {
  assert.equal(fmtMarketCap(2.5e12), '$2.50T');
  assert.equal(fmtMarketCap(3.2e9), '$3.20B');
  assert.equal(fmtMarketCap(4.1e6), '$4.10M');
  assert.equal(fmtMarketCap(0), '—', 'zero is missing data, not a real cap');
});

test('timeAgo degrades from minutes to days', () => {
  const now = Date.now();
  assert.equal(timeAgo(now), 'just now');
  assert.equal(timeAgo(now - 5 * 60_000), '5m ago');
  assert.equal(timeAgo(now - 3 * 3600_000), '3h ago');
  assert.equal(timeAgo(now - 2 * 864e5), '2d ago');
});
