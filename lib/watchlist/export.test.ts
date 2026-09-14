import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from './export.ts';

/** Minimal entry — only the fields the exporter reads need to be real. */
const entry = (over: Partial<WatchlistEntry> = {}): WatchlistEntry =>
  ({
    symbol: 'NVDA', company: 'NVIDIA', list: 'Main', category: 'active',
    thesis: null, direction: 'long', entryLow: null, entryHigh: null,
    invalidationPrice: null, targetPrice: null, catalystDate: null,
    catalystNote: null, catalystTradingDays: null, notify: true, mutedUntil: null,
    owned: false, ownedAt: null, ownedPrice: null, ownedReturnPct: null,
    lastReviewedAt: null, daysSinceReview: 0, addedAt: '2026-01-01T00:00:00.000Z',
    priceHistory: [], price: 100, changePercent: null, week52High: null,
    week52Low: null, marketCap: null, peRatio: null, dataAsOf: null, stale: false,
    unconfirmedFields: [], distanceToEntryPct: null, unseenCount: 0,
    topUnseenSeverity: 0, events: [], ...over,
  }) as WatchlistEntry;

test('neutralises formulas so a thesis cannot execute in Excel', () => {
  // Excel/Sheets execute a cell starting with = + - or @. Thesis text is free-form.
  for (const payload of ['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("http://x","click")']) {
    const csv = toCsv([entry({ thesis: payload })]);
    // The security property is that the dangerous leading character is no longer
    // leading — an apostrophe sits in front of it. Assert that directly rather
    // than matching the whole cell, which may also be CSV-quoted and escaped.
    const lead = payload[0];
    assert.ok(
      csv.includes(`'${lead}`),
      `payload not neutralised: ${payload}`
    );
    assert.ok(
      !new RegExp(`(^|[,"])\\${lead}`, 'm').test(csv),
      `payload still starts a cell: ${payload}`
    );
  }
});

test('quotes and escapes fields containing commas, quotes or newlines', () => {
  const csv = toCsv([entry({ thesis: 'Buy the dip, then hold' })]);
  assert.match(csv, /"Buy the dip, then hold"/);

  const quoted = toCsv([entry({ thesis: 'He said "buy"' })]);
  assert.match(quoted, /"He said ""buy"""/);
});

test('emits a header plus one row per entry', () => {
  const csv = toCsv([entry(), entry({ symbol: 'MSFT' })]);
  const lines = csv.split('\n');
  assert.match(lines[0], /^Symbol,Company,/);
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^NVDA,/);
  assert.match(lines[2], /^MSFT,/);
});

test('renders nulls as empty cells rather than the string "null"', () => {
  const csv = toCsv([entry({ peRatio: null, thesis: null })]);
  assert.ok(!csv.includes('null'), 'literal "null" leaked into the export');
});
