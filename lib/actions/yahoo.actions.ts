'use server';

/**
 * Indian market data, via a keyless public endpoint.
 *
 * Why a second provider at all: the primary one returns a null price for every
 * NSE and BSE listing on this plan, which is why those tickers were filtered out
 * of search entirely — a row that could never update is worse than no row. This
 * closes that gap without adding a key, an account or a bill.
 *
 * Why it is confined to Indian listings: for US tickers the two sources are not
 * independent. Checked across ten symbols including thin names, every price
 * matched to the cent — they share an upstream feed. Routing US traffic here
 * would add a second point of failure and buy nothing.
 *
 * It fails soft on purpose. This endpoint is public but unofficial, so it is
 * treated as best-effort: a failure produces a snapshot flagged stale rather
 * than a thrown error, and the rest of the pipeline already knows how to
 * present a symbol it cannot currently see.
 */

import { log } from '@/lib/observability/logger';
import { exchangeOf, siblingListing, crossListingDivergence, CROSS_LISTING_TOLERANCE_PCT } from '@/lib/changes/exchange';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface ChartMeta {
  currency?: string;
  symbol?: string;
  longName?: string;
  shortName?: string;
  fullExchangeName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
  chartPreviousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

export interface YahooQuote {
  symbol: string;
  price?: number;
  changePercent?: number;
  dayHigh?: number;
  dayLow?: number;
  prevClose?: number;
  week52High?: number;
  week52Low?: number;
  currency?: string;
  company?: string;
  exchange?: string;
  /** The venue's own timestamp, which is what freshness must be measured against. */
  asOf: Date;
  stale: boolean;
  /**
   * The exchange has no such listing. Permanent, and actionable in a way an
   * outage is not — the fix is to rename or remove the row, not to wait.
   */
  notFound?: boolean;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Thrown for a 404, which is permanent — the ticker is gone, not unreachable. */
class SymbolNotFound extends Error {
  constructor(symbol: string) {
    super(`No listing for ${symbol}`);
    this.name = 'SymbolNotFound';
  }
}

async function fetchMeta(symbol: string, revalidateSeconds: number): Promise<ChartMeta | null> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    // A browser-shaped UA: the endpoint is public but rejects some clients.
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    cache: 'force-cache',
    next: { revalidate: revalidateSeconds },
  });
  // 404 means the exchange has no such listing. Indian markets rename and
  // demerge often — Zomato is now ETERNAL.NS, Tata Motors split into TMPV.NS —
  // so a watchlist row can outlive the ticker it was created with.
  if (res.status === 404) throw new SymbolNotFound(symbol);
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);

  const json = (await res.json()) as {
    chart?: { result?: { meta?: ChartMeta }[]; error?: { code?: string } | null };
  };
  // It can also answer 200 with an error body, which means the same thing.
  if (json?.chart?.error?.code === 'Not Found') throw new SymbolNotFound(symbol);
  return json?.chart?.result?.[0]?.meta ?? null;
}

/** One quote. Never throws — a failure comes back flagged stale. */
export async function getIndianQuote(symbol: string, revalidateSeconds = 300): Promise<YahooQuote> {
  const sym = symbol.trim().toUpperCase();
  const now = new Date();
  try {
    const m = await fetchMeta(sym, revalidateSeconds);
    const price = num(m?.regularMarketPrice);
    const asOfSeconds = num(m?.regularMarketTime);
    return {
      symbol: sym,
      price,
      changePercent: num(m?.regularMarketChangePercent),
      dayHigh: num(m?.regularMarketDayHigh),
      dayLow: num(m?.regularMarketDayLow),
      prevClose: num(m?.chartPreviousClose),
      week52High: num(m?.fiftyTwoWeekHigh),
      week52Low: num(m?.fiftyTwoWeekLow),
      // Trust the venue's own currency over our suffix guess — the suffix says
      // where it trades, the payload says what it is priced in.
      currency: m?.currency ?? exchangeOf(sym).currency,
      company: m?.longName || m?.shortName || undefined,
      exchange: m?.fullExchangeName || exchangeOf(sym).label,
      asOf: asOfSeconds ? new Date(asOfSeconds * 1000) : now,
      stale: price == null,
    };
  } catch (err) {
    if (err instanceof SymbolNotFound) {
      // Not a warning — nothing is broken. The watchlist is simply out of date.
      log.info('yahoo.symbol.not_found', { symbol: sym });
      return { symbol: sym, asOf: now, stale: true, notFound: true, currency: exchangeOf(sym).currency };
    }
    log.warn('yahoo.quote.failed', { symbol: sym }, err);
    return { symbol: sym, asOf: now, stale: true, currency: exchangeOf(sym).currency };
  }
}

export interface CrossListingCheck {
  primary: string;
  sibling: string;
  primaryPrice: number | null;
  siblingPrice: number | null;
  divergencePct: number | null;
  /** True when the two venues disagree by more than the tolerance. */
  diverged: boolean;
}

/**
 * Compare a company's NSE and BSE quotes.
 *
 * This is the one place a genuine second opinion exists, because the two venues
 * really are independent order books for the same company. Reliance quoted
 * 1243.9 on NSE against 1240.8 on BSE while this was written — a real 0.25% gap,
 * not a simulated one.
 */
export async function checkCrossListing(symbol: string): Promise<CrossListingCheck | null> {
  const sibling = siblingListing(symbol);
  if (!sibling) return null;

  const [a, b] = await Promise.all([getIndianQuote(symbol), getIndianQuote(sibling)]);
  const divergencePct = crossListingDivergence(a.price ?? null, b.price ?? null);

  return {
    primary: a.symbol,
    sibling: b.symbol,
    primaryPrice: a.price ?? null,
    siblingPrice: b.price ?? null,
    divergencePct,
    diverged: divergencePct != null && divergencePct > CROSS_LISTING_TOLERANCE_PCT,
  };
}
