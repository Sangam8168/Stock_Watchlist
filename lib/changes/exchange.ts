// Which market does this symbol trade on, and is that market open?
//
// Until now every hours question was answered in America/New_York, which was
// correct while the app only carried US listings. It stops being correct the
// moment an NSE listing appears: a price captured at 14:00 IST is fresh, but a
// New-York-shaped staleness rule would call it hours old — and an alert gated on
// "the market is open" would never fire during the only session that matters.
//
// Pure and table-driven so a third venue is a row, not a rewrite.

export type ExchangeId = 'US' | 'NSE' | 'BSE';

export interface Exchange {
  id: ExchangeId;
  label: string;
  timeZone: string;
  currency: string;
  /** Regular session, in minutes past local midnight. */
  openMinutes: number;
  closeMinutes: number;
  /** Yahoo suffix for this venue; US listings carry none. */
  suffix: string;
}

export const EXCHANGES: Record<ExchangeId, Exchange> = {
  US:  { id: 'US',  label: 'US',  timeZone: 'America/New_York', currency: 'USD', openMinutes: 9 * 60 + 30, closeMinutes: 16 * 60, suffix: '' },
  // 09:15–15:30 IST. Note this is a shorter session that closes before the US
  // one opens, so the two never overlap — a single global "is the market open"
  // flag could never have been right for both.
  NSE: { id: 'NSE', label: 'NSE', timeZone: 'Asia/Kolkata', currency: 'INR', openMinutes: 9 * 60 + 15, closeMinutes: 15 * 60 + 30, suffix: '.NS' },
  BSE: { id: 'BSE', label: 'BSE', timeZone: 'Asia/Kolkata', currency: 'INR', openMinutes: 9 * 60 + 15, closeMinutes: 15 * 60 + 30, suffix: '.BO' },
};

/** Venue for a ticker. Unsuffixed symbols are US listings. */
export function exchangeOf(symbol: string): Exchange {
  const s = (symbol ?? '').trim().toUpperCase();
  if (s.endsWith('.NS')) return EXCHANGES.NSE;
  if (s.endsWith('.BO')) return EXCHANGES.BSE;
  return EXCHANGES.US;
}

/** The ticker without its venue suffix — RELIANCE.NS and RELIANCE.BO share a root. */
export function rootOf(symbol: string): string {
  return (symbol ?? '').trim().toUpperCase().replace(/\.(NS|BO)$/, '');
}

/** The same company's listing on the other Indian venue, if there is one. */
export function siblingListing(symbol: string): string | null {
  const ex = exchangeOf(symbol);
  if (ex.id === 'NSE') return `${rootOf(symbol)}.BO`;
  if (ex.id === 'BSE') return `${rootOf(symbol)}.NS`;
  return null;
}

function localParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(p.hour === '24' ? '0' : p.hour);
  return {
    weekday: weekdayMap[p.weekday] ?? 1,
    minutes: hour * 60 + Number(p.minute),
    iso: `${p.year}-${p.month}-${p.day}`,
  };
}

/**
 * Indian market holidays are not enumerated here, only weekends. Being wrong in
 * this direction is safe: treating a closed day as open can only suppress an
 * alert we would rather not fire on a still market, never invent one.
 */
export function isOpenOn(exchange: Exchange, date: Date = new Date()): boolean {
  const { weekday, minutes } = localParts(date, exchange.timeZone);
  if (weekday === 0 || weekday === 6) return false;
  return minutes >= exchange.openMinutes && minutes < exchange.closeMinutes;
}

/** Is the venue this symbol trades on currently open? */
export function isMarketOpenFor(symbol: string, date: Date = new Date()): boolean {
  return isOpenOn(exchangeOf(symbol), date);
}

/**
 * Two listings of one company should not disagree by much. A persistent gap is
 * either a genuine arbitrage or, far more often, one venue's quote being stale —
 * and either way the number on screen deserves a caveat.
 */
export const CROSS_LISTING_TOLERANCE_PCT = 0.5;

export function crossListingDivergence(a: number | null, b: number | null): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const mid = (a + b) / 2;
  if (mid <= 0) return null;
  return (Math.abs(a - b) / mid) * 100;
}
