'use server';

// Real market data for the signed-out pages. No auth required, so everything
// here is public information only: last price and day change for a fixed set of
// large caps, plus real recent price series for the ones we have history on.
//
// The app's whole argument is that it tells you the truth about your data, so
// the front door shouldn't be showing an invented chart labelled "live".

import { fetchJSON } from '@/lib/actions/finnhub.actions';
import { connectToDatabase } from '@/database/mongoose';
import { Snapshot } from '@/database/models/snapshot.model';
import { marketStatus } from '@/lib/market';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

const PULSE_SYMBOLS = [
  'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN',
  'META', 'TSLA', 'JPM', 'XOM', 'LLY', 'AVGO', 'NFLX',
] as const;

/** Preference order for the chart — we only chart what we genuinely have history for. */
const CHART_CANDIDATES = ['NVDA', 'MSFT', 'TSLA', 'JPM', 'LLY', 'XOM', 'AAPL'] as const;
const MAX_CHARTS = 4;

const MARKET_STATE_LABEL: Record<ReturnType<typeof marketStatus>, string> = {
  open: 'Market open',
  pre: 'Pre-market',
  after: 'After hours',
  'closed-weekend': 'Market closed — weekend',
  'closed-holiday': 'Market closed — holiday',
};

interface FinnhubQuote {
  c?: number; // current
  dp?: number; // percent change
  t?: number; // unix seconds
}

export interface PulseQuote {
  symbol: string;
  price: number;
  changePercent: number;
}

export interface PulseChart extends PulseQuote {
  /** Recent closes, oldest → newest, ending on the live quote. */
  series: number[];
}

export interface MarketPulse {
  quotes: PulseQuote[];
  charts: PulseChart[];
  /** Where the numbers came from, so the UI can say so instead of implying live. */
  source: 'live' | 'unavailable';
  asOf: string | null;
  marketState: string;
}

const EMPTY = (marketState: string): MarketPulse => ({
  quotes: [],
  charts: [],
  source: 'unavailable',
  asOf: null,
  marketState,
});

/**
 * Recent closes per symbol from our own snapshot series — the free Finnhub tier
 * has no candle endpoint, so the resolution is whatever our poll captured. One
 * aggregation for every symbol rather than a query each.
 */
async function storedSeries(symbols: string[], perSymbol = 40): Promise<Record<string, number[]>> {
  if (!symbols.length) return {};
  try {
    await connectToDatabase();
    const rows = await Snapshot.aggregate<{ _id: string; prices: number[] }>([
      // Demo/simulated snapshots carry invented prices. Mixing them into a real
      // line produces a plausible-looking chart of nothing, which is worse than
      // showing no chart at all.
      { $match: { symbol: { $in: symbols }, price: { $gt: 0 }, source: { $nin: ['demo', 'finnhub:no-quote'] } } },
      { $sort: { capturedAt: 1 } },
      { $group: { _id: '$symbol', prices: { $push: '$price' } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.prices.slice(-perSymbol)]));
  } catch {
    return {};
  }
}

/**
 * A line is only worth drawing once we've captured genuine movement. Over a
 * closed weekend every poll returns the same close, and a flat line pretending
 * to be a chart is just a lie with fewer pixels.
 */
function isChartable(series: number[]): boolean {
  return series.length >= 6 && new Set(series).size >= 3;
}

export async function getMarketPulse(): Promise<MarketPulse> {
  const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  const marketState = MARKET_STATE_LABEL[marketStatus()];
  if (!token) return EMPTY(marketState);

  const settled = await Promise.allSettled(
    PULSE_SYMBOLS.map(async (symbol) => {
      const url = `${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${token}`;
      // 60s cache: this strip is a shop window, not a trading surface.
      const q = await fetchJSON<FinnhubQuote>(url, 60);
      if (typeof q?.c !== 'number' || q.c <= 0) return null;
      return { symbol, price: q.c, changePercent: typeof q.dp === 'number' ? q.dp : 0, t: q.t ?? 0 };
    })
  );

  const raw = settled
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((q): q is NonNullable<typeof q> => q !== null);
  if (!raw.length) return EMPTY(marketState);

  const bySymbol = new Map(raw.map((q) => [q.symbol, q]));
  const wanted = CHART_CANDIDATES.filter((s) => bySymbol.has(s));
  const history = await storedSeries([...wanted]);

  const charts: PulseChart[] = wanted
    .map((symbol): PulseChart | null => {
      const q = bySymbol.get(symbol)!;
      // Only chart a symbol we have real, moving history for; end on the live quote.
      const series = [...(history[symbol] ?? []), q.price];
      if (!isChartable(series)) return null;
      return { symbol, price: q.price, changePercent: q.changePercent, series };
    })
    .filter((c): c is PulseChart => c !== null)
    .slice(0, MAX_CHARTS);

  const newestTs = Math.max(...raw.map((q) => q.t));

  return {
    quotes: raw.map(({ symbol, price, changePercent }) => ({ symbol, price, changePercent })),
    charts,
    source: 'live',
    asOf: newestTs > 0 ? new Date(newestTs * 1000).toISOString() : new Date().toISOString(),
    marketState,
  };
}
