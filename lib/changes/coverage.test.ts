import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessCoverage, OPEN_TOLERANCE_MS, CLOSED_TOLERANCE_MS } from './coverage.ts';

const NOW = new Date('2026-09-16T15:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

test('no symbols: silence is honest, there is nothing to miss', () => {
  const r = assessCoverage([], { now: NOW, marketOpen: true });
  assert.equal(r.canAssertQuiet, true);
  assert.equal(r.total, 0);
});

test('all recently captured: quiet can be asserted', () => {
  const r = assessCoverage(
    [
      { symbol: 'AAPL', capturedAt: ago(60_000), stale: false },
      { symbol: 'MSFT', capturedAt: ago(120_000), stale: false },
    ],
    { now: NOW, marketOpen: true }
  );
  assert.equal(r.fresh, 2);
  assert.equal(r.canAssertQuiet, true);
});

test('a symbol we hold nothing for makes silence untrustworthy', () => {
  const r = assessCoverage(
    [
      { symbol: 'AAPL', capturedAt: ago(60_000), stale: false },
      { symbol: 'NEW', capturedAt: null, stale: false },
    ],
    { now: NOW, marketOpen: true }
  );
  assert.equal(r.blind, 1);
  assert.equal(r.canAssertQuiet, false);
  assert.deepEqual(r.unseen, ['NEW']);
});

test('provider-flagged stale counts as degraded even when just captured', () => {
  const r = assessCoverage([{ symbol: 'AAPL', capturedAt: ago(1000), stale: true }], {
    now: NOW,
    marketOpen: true,
  });
  assert.equal(r.degraded, 1);
  assert.equal(r.fresh, 0);
  assert.equal(r.canAssertQuiet, false);
});

test('market open: three missed polls is degraded, two is not', () => {
  const ok = assessCoverage([{ symbol: 'A', capturedAt: ago(OPEN_TOLERANCE_MS - 1000), stale: false }], {
    now: NOW,
    marketOpen: true,
  });
  assert.equal(ok.canAssertQuiet, true);

  const bad = assessCoverage([{ symbol: 'A', capturedAt: ago(OPEN_TOLERANCE_MS + 1000), stale: false }], {
    now: NOW,
    marketOpen: true,
  });
  assert.equal(bad.canAssertQuiet, false);
});

test('market closed: an overnight-old capture is fine, not an alarm', () => {
  const r = assessCoverage([{ symbol: 'A', capturedAt: ago(20 * 60 * 60 * 1000), stale: false }], {
    now: NOW,
    marketOpen: false,
  });
  assert.equal(r.fresh, 1);
  assert.equal(r.canAssertQuiet, true);
});

test('market closed: past a long weekend it is degraded again', () => {
  const r = assessCoverage([{ symbol: 'A', capturedAt: ago(CLOSED_TOLERANCE_MS + 1000), stale: false }], {
    now: NOW,
    marketOpen: false,
  });
  assert.equal(r.canAssertQuiet, false);
});

test('a capture ahead of now is clock skew, not staleness', () => {
  const r = assessCoverage([{ symbol: 'A', capturedAt: new Date(NOW.getTime() + 60_000), stale: false }], {
    now: NOW,
    marketOpen: true,
  });
  assert.equal(r.fresh, 1);
  assert.equal(r.canAssertQuiet, true);
});

test('oldest unseen capture is reported, and unseen is sorted', () => {
  const r = assessCoverage(
    [
      { symbol: 'ZZZ', capturedAt: ago(OPEN_TOLERANCE_MS * 4), stale: false },
      { symbol: 'AAA', capturedAt: ago(OPEN_TOLERANCE_MS * 2), stale: false },
      { symbol: 'MMM', capturedAt: ago(1000), stale: false },
    ],
    { now: NOW, marketOpen: true }
  );
  assert.deepEqual(r.unseen, ['AAA', 'ZZZ']);
  assert.equal(r.oldestUnseenAt?.getTime(), ago(OPEN_TOLERANCE_MS * 4).getTime());
});

test('a delisted ticker is reported apart from blindness, and does not block quiet', () => {
  const r = assessCoverage(
    [
      { symbol: 'AAPL', capturedAt: ago(60_000), stale: false },
      { symbol: 'ZOMATO.NS', capturedAt: null, stale: true, notFound: true },
    ],
    { now: NOW, marketOpen: true }
  );
  assert.deepEqual(r.delisted, ['ZOMATO.NS']);
  assert.deepEqual(r.unseen, [], 'a dead ticker is not something we are blind about');
  assert.equal(r.blind, 0);
  // The crucial one: a warning the user alone can clear must not latch forever.
  assert.equal(r.canAssertQuiet, true);
});

test('a genuine outage still blocks quiet even alongside a delisted row', () => {
  const r = assessCoverage(
    [
      { symbol: 'ZOMATO.NS', capturedAt: null, stale: true, notFound: true },
      { symbol: 'TCS.NS', capturedAt: ago(OPEN_TOLERANCE_MS * 4), stale: false },
    ],
    { now: NOW, marketOpen: true }
  );
  assert.deepEqual(r.delisted, ['ZOMATO.NS']);
  assert.deepEqual(r.unseen, ['TCS.NS']);
  assert.equal(r.canAssertQuiet, false);
});

test('delisted rows are excluded from the fresh/degraded tallies entirely', () => {
  const r = assessCoverage(
    [{ symbol: 'GONE.NS', capturedAt: null, stale: true, notFound: true }],
    { now: NOW, marketOpen: true }
  );
  assert.equal(r.fresh, 0);
  assert.equal(r.degraded, 0);
  assert.equal(r.blind, 0);
  assert.equal(r.total, 1, 'it is still counted in the total — it is on the watchlist');
});
