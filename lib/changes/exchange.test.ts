import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exchangeOf, rootOf, siblingListing, isOpenOn, isMarketOpenFor,
  crossListingDivergence, EXCHANGES,
} from './exchange.ts';

test('venue is read from the suffix; unsuffixed means US', () => {
  assert.equal(exchangeOf('RELIANCE.NS').id, 'NSE');
  assert.equal(exchangeOf('reliance.bo').id, 'BSE');
  assert.equal(exchangeOf('AAPL').id, 'US');
  assert.equal(exchangeOf('').id, 'US');
});

test('the root is shared across a company\'s two Indian listings', () => {
  assert.equal(rootOf('RELIANCE.NS'), 'RELIANCE');
  assert.equal(rootOf('RELIANCE.BO'), 'RELIANCE');
  assert.equal(rootOf('AAPL'), 'AAPL');
});

test('each Indian listing points at its sibling; US listings have none', () => {
  assert.equal(siblingListing('TCS.NS'), 'TCS.BO');
  assert.equal(siblingListing('TCS.BO'), 'TCS.NS');
  assert.equal(siblingListing('AAPL'), null);
});

test('Indian and US sessions never overlap — one global flag could not serve both', () => {
  // 11:00 IST on a Wednesday = 05:30 ET, hours before the US open.
  const istMorning = new Date('2026-09-16T05:30:00Z');
  assert.equal(isOpenOn(EXCHANGES.NSE, istMorning), true);
  assert.equal(isOpenOn(EXCHANGES.US, istMorning), false);

  // 14:00 ET the same day = 23:30 IST, long after the Indian close.
  const usAfternoon = new Date('2026-09-16T18:00:00Z');
  assert.equal(isOpenOn(EXCHANGES.US, usAfternoon), true);
  assert.equal(isOpenOn(EXCHANGES.NSE, usAfternoon), false);
});

test('the Indian session boundaries are 09:15 and 15:30 IST', () => {
  // 09:14 IST = 03:44 UTC — one minute before the open.
  assert.equal(isOpenOn(EXCHANGES.NSE, new Date('2026-09-16T03:44:00Z')), false);
  assert.equal(isOpenOn(EXCHANGES.NSE, new Date('2026-09-16T03:45:00Z')), true);
  // 15:29 IST = 09:59 UTC, still open; 15:30 = 10:00 UTC, closed.
  assert.equal(isOpenOn(EXCHANGES.NSE, new Date('2026-09-16T09:59:00Z')), true);
  assert.equal(isOpenOn(EXCHANGES.NSE, new Date('2026-09-16T10:00:00Z')), false);
});

test('weekends are closed on both venues', () => {
  const saturday = new Date('2026-09-19T05:30:00Z');
  assert.equal(isOpenOn(EXCHANGES.NSE, saturday), false);
  assert.equal(isOpenOn(EXCHANGES.US, saturday), false);
});

test('isMarketOpenFor routes by symbol, not by a global assumption', () => {
  const istMorning = new Date('2026-09-16T05:30:00Z');
  assert.equal(isMarketOpenFor('RELIANCE.NS', istMorning), true);
  assert.equal(isMarketOpenFor('AAPL', istMorning), false);
});

test('each venue carries its own currency, so INR is never treated as dollars', () => {
  assert.equal(exchangeOf('TCS.NS').currency, 'INR');
  assert.equal(exchangeOf('AAPL').currency, 'USD');
});

test('cross-listing divergence is a percentage of the midpoint, and null-safe', () => {
  // Real figures: Reliance quoted 1243.9 on NSE and 1240.8 on BSE.
  const d = crossListingDivergence(1243.9, 1240.8);
  assert.ok(d !== null && d > 0.24 && d < 0.26, `expected ~0.25%, got ${d}`);
  assert.equal(crossListingDivergence(100, null), null);
  assert.equal(crossListingDivergence(0, 0), null);
  assert.equal(crossListingDivergence(NaN, 100), null);
});
