// Client-side export helpers — no server round-trip, no dependency.

const CSV_COLUMNS: { header: string; get: (e: WatchlistEntry) => string | number | null }[] = [
  { header: 'Symbol', get: (e) => e.symbol },
  { header: 'Company', get: (e) => e.company },
  { header: 'Category', get: (e) => e.category },
  { header: 'Direction', get: (e) => e.direction },
  { header: 'Thesis', get: (e) => e.thesis },
  { header: 'Price', get: (e) => e.price },
  { header: 'Change %', get: (e) => e.changePercent },
  { header: 'Entry low', get: (e) => e.entryLow },
  { header: 'Entry high', get: (e) => e.entryHigh },
  { header: 'Distance to entry %', get: (e) => e.distanceToEntryPct },
  { header: 'Invalidation', get: (e) => e.invalidationPrice },
  { header: 'Target', get: (e) => e.targetPrice },
  { header: 'P/E', get: (e) => e.peRatio },
  { header: 'Market cap', get: (e) => e.marketCap },
  { header: '52w high', get: (e) => e.week52High },
  { header: '52w low', get: (e) => e.week52Low },
  { header: 'Catalyst', get: (e) => e.catalystNote },
  { header: 'Catalyst date', get: (e) => (e.catalystDate ? e.catalystDate.slice(0, 10) : null) },
  { header: 'Catalyst trading days', get: (e) => e.catalystTradingDays },
  { header: 'Unreviewed updates', get: (e) => e.unseenCount },
  { header: 'Data as of', get: (e) => e.dataAsOf },
  { header: 'Stale', get: (e) => (e.stale ? 'yes' : 'no') },
  { header: 'Muted until', get: (e) => (e.mutedUntil ? e.mutedUntil.slice(0, 10) : null) },
  { header: 'Added', get: (e) => e.addedAt.slice(0, 10) },
];

/**
 * Excel and Sheets execute a cell that opens with = + - or @. A thesis is free
 * text, so prefix those with an apostrophe to keep them data rather than code.
 */
const deFormula = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

const cell = (v: string | number | null): string => {
  if (v == null) return '';
  const s = deFormula(String(v));
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** TSV cells can't be quoted, so tabs and newlines have to become spaces. */
const tsvCell = (v: string | number | null): string =>
  v == null ? '' : deFormula(String(v)).replace(/[\t\r\n]+/g, ' ');

export function toCsv(entries: WatchlistEntry[]): string {
  const head = CSV_COLUMNS.map((c) => c.header).join(',');
  const rows = entries.map((e) => CSV_COLUMNS.map((c) => cell(c.get(e))).join(','));
  return [head, ...rows].join('\n');
}

export function downloadCsv(entries: WatchlistEntry[], filename = 'watchlist.csv') {
  const blob = new Blob([toCsv(entries)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy as TSV — pastes straight into Excel / Google Sheets. */
export async function copyForSheets(entries: WatchlistEntry[]): Promise<boolean> {
  const head = CSV_COLUMNS.map((c) => c.header).join('\t');
  const rows = entries.map((e) => CSV_COLUMNS.map((c) => tsvCell(c.get(e))).join('\t'));
  try {
    await navigator.clipboard.writeText([head, ...rows].join('\n'));
    return true;
  } catch {
    return false;
  }
}
