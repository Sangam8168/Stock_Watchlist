import test from 'node:test';
import assert from 'node:assert/strict';
import { isTradingDay, isMarketOpen, tradingDaysUntil, marketStatus } from './market.ts';

// All fixtures are UTC instants; the module converts to America/New_York itself.
// That conversion is the whole point of the module, so the tests assert against
// New York wall-clock expectations rather than UTC ones.
const utc = (s: string) => new Date(s);

test('weekends are not trading days', () => {
  assert.equal(isTradingDay(utc('2026-09-05T15:00:00Z')), false, 'Saturday');
  assert.equal(isTradingDay(utc('2026-09-06T15:00:00Z')), false, 'Sunday');
  assert.equal(isTradingDay(utc('2026-09-08T15:00:00Z')), true, 'Tuesday');
});

test('US market holidays are not trading days', () => {
  assert.equal(isTradingDay(utc('2026-07-03T15:00:00Z')), false, 'Independence Day observed');
  assert.equal(isTradingDay(utc('2026-12-25T15:00:00Z')), false, 'Christmas');
  assert.equal(isTradingDay(utc('2026-12-24T15:00:00Z')), true, 'Christmas Eve trades');
});

test('market hours are 09:30-16:00 New York, not UTC', () => {
  // 14:00 UTC = 10:00 ET in September (EDT, UTC-4) → open.
  assert.equal(isMarketOpen(utc('2026-09-08T14:00:00Z')), true);
  // 13:00 UTC = 09:00 ET → pre-market, closed.
  assert.equal(isMarketOpen(utc('2026-09-08T13:00:00Z')), false);
  // 20:30 UTC = 16:30 ET → after hours, closed.
  assert.equal(isMarketOpen(utc('2026-09-08T20:30:00Z')), false);
});

test('the open/close boundaries are handled inclusively at 09:30 and exclusively at 16:00', () => {
  assert.equal(isMarketOpen(utc('2026-09-08T13:30:00Z')), true, '09:30 ET exactly — open');
  assert.equal(isMarketOpen(utc('2026-09-08T20:00:00Z')), false, '16:00 ET exactly — closed');
});

test('market never opens on a weekend, whatever the clock says', () => {
  assert.equal(isMarketOpen(utc('2026-09-05T14:00:00Z')), false);
});

test('tradingDaysUntil skips weekends rather than counting calendar days', () => {
  // Friday → Monday is 3 calendar days but 1 trading day.
  const friday = utc('2026-09-11T14:00:00Z');
  assert.equal(tradingDaysUntil(utc('2026-09-14T14:00:00Z'), friday), 1);
});

test('tradingDaysUntil skips holidays too', () => {
  // Thu 2026-12-24 → Mon 2026-12-28, with Christmas (Fri) closed.
  const eve = utc('2026-12-24T14:00:00Z');
  assert.equal(tradingDaysUntil(utc('2026-12-28T14:00:00Z'), eve), 1);
});

test('tradingDaysUntil returns 0 for today and null for no date', () => {
  const d = utc('2026-09-08T14:00:00Z');
  assert.equal(tradingDaysUntil(d, d), 0);
  assert.equal(tradingDaysUntil(null), null);
  assert.equal(tradingDaysUntil(undefined), null);
});

test('tradingDaysUntil rejects an unparseable date instead of returning NaN', () => {
  assert.equal(tradingDaysUntil('not-a-date'), null);
});

test('marketStatus distinguishes pre, open, after, weekend and holiday', () => {
  assert.equal(marketStatus(utc('2026-09-08T13:00:00Z')), 'pre');
  assert.equal(marketStatus(utc('2026-09-08T14:00:00Z')), 'open');
  assert.equal(marketStatus(utc('2026-09-08T21:00:00Z')), 'after');
  assert.equal(marketStatus(utc('2026-09-05T14:00:00Z')), 'closed-weekend');
  assert.equal(marketStatus(utc('2026-12-25T14:00:00Z')), 'closed-holiday');
});
