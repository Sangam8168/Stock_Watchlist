'use server';

// Search-page data: what's trending, and richer search results.
//
// "Trending" here is not bought from a data vendor — it is derived from the
// WatchedSymbol refcount the ingestion pipeline already maintains. That index
// exists so we poll each ticker once regardless of how many people watch it;
// reading it sorted by watcher count is a free, honest popularity signal from
// this app's own users. No extra API calls, no invented numbers.

import { connectToDatabase } from '@/database/mongoose';
import { WatchedSymbolModel } from '@/database/models/watchedSymbol.model';
import { Watchlist } from '@/database/models/watchlist.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { log } from '@/lib/observability/logger';

export interface TrendingItem {
  symbol: string;
  company: string;
  watchers: number;
  price: number | null;
  changePercent: number | null;
  logo: string | null;
  isInWatchlist: boolean;
}

/**
 * Most-watched tickers across all users, with the price we already cached on
 * WatchedSymbol.latest — so this costs one indexed query and zero provider calls.
 */
export async function getTrending(limit = 6): Promise<TrendingItem[]> {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    const rows = await WatchedSymbolModel.find(
      { watchers: { $gt: 0 } },
      { symbol: 1, watchers: 1, latest: 1 }
    )
      .sort({ watchers: -1, updatedAt: -1 })
      .limit(Math.min(limit, 20))
      .lean();

    const mine = userId
      ? new Set(
          (await Watchlist.find({ userId }, { symbol: 1 }).lean()).map((w) => w.symbol)
        )
      : new Set<string>();

    // A company name only exists on a watchlist row, so look them up in one query.
    const names = new Map(
      (await Watchlist.find({ symbol: { $in: rows.map((r) => r.symbol) } }, { symbol: 1, company: 1 }).lean())
        .map((w) => [w.symbol, w.company])
    );

    return rows.map((r) => {
      const latest = r.latest as { price?: number; changePercent?: number } | undefined;
      return {
        symbol: r.symbol,
        company: names.get(r.symbol) ?? r.symbol,
        watchers: r.watchers ?? 0,
        price: latest?.price ?? null,
        changePercent: latest?.changePercent ?? null,
        logo: null,
        isInWatchlist: mine.has(r.symbol),
      };
    });
  } catch (err) {
    log.error('discover.trending.failed', err);
    return [];
  }
}

export interface DiscoverRow {
  symbol: string;
  company: string;
  price: number | null;
  changePercent: number | null;
  /** How far below the 52-week high, as a positive percentage. */
  offHighPct: number | null;
  /** How far above the 52-week low, as a positive percentage. */
  offLowPct: number | null;
  peRatio: number | null;
  marketCap: number | null;
  watchers: number;
  isInWatchlist: boolean;
}

export interface Discovery {
  gainers: DiscoverRow[];
  losers: DiscoverRow[];
  nearHigh: DiscoverRow[];
  nearLow: DiscoverRow[];
  /** How many symbols this was computed over — stated, not implied. */
  universe: number;
}

const EMPTY_DISCOVERY: Discovery = { gainers: [], losers: [], nearHigh: [], nearLow: [], universe: 0 };

/**
 * Movers and 52-week extremes, from the snapshot already cached on
 * WatchedSymbol.latest. Zero provider calls, one indexed read.
 *
 * Scope matters and the UI says so: this is every symbol *someone here tracks*,
 * not the whole market. Presenting it as market-wide would be a lie that grows
 * more wrong the smaller the user base is.
 */
export async function getDiscovery(perSection = 5): Promise<Discovery> {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    const rows = await WatchedSymbolModel.find(
      { watchers: { $gt: 0 } },
      { symbol: 1, watchers: 1, latest: 1 }
    ).lean();
    if (!rows.length) return EMPTY_DISCOVERY;

    const [mine, names] = await Promise.all([
      userId
        ? Watchlist.find({ userId }, { symbol: 1 }).lean().then((w) => new Set(w.map((x) => x.symbol)))
        : Promise.resolve(new Set<string>()),
      Watchlist.find({ symbol: { $in: rows.map((r) => r.symbol) } }, { symbol: 1, company: 1 })
        .lean()
        .then((w) => new Map(w.map((x) => [x.symbol, x.company]))),
    ]);

    const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

    const built: DiscoverRow[] = rows.map((r) => {
      const l = (r.latest ?? {}) as Record<string, unknown>;
      const price = fin(l.price);
      const hi = fin(l.week52High);
      const lo = fin(l.week52Low);
      return {
        symbol: r.symbol,
        company: names.get(r.symbol) ?? r.symbol,
        price,
        changePercent: fin(l.changePercent),
        // Guard the divisors: a missing or zero 52-week band must produce null,
        // not Infinity dressed up as "0% off its high".
        offHighPct: price != null && hi != null && hi > 0 ? ((hi - price) / hi) * 100 : null,
        offLowPct: price != null && lo != null && lo > 0 ? ((price - lo) / lo) * 100 : null,
        peRatio: fin(l.peRatio),
        marketCap: fin(l.marketCap),
        watchers: r.watchers ?? 0,
        isInWatchlist: mine.has(r.symbol),
      };
    });

    const byChange = built.filter((b) => b.changePercent != null);
    const top = <T,>(arr: T[], n: number) => arr.slice(0, n);

    return {
      gainers: top([...byChange].sort((a, b) => b.changePercent! - a.changePercent!).filter((b) => b.changePercent! > 0), perSection),
      losers: top([...byChange].sort((a, b) => a.changePercent! - b.changePercent!).filter((b) => b.changePercent! < 0), perSection),
      nearHigh: top(built.filter((b) => b.offHighPct != null).sort((a, b) => a.offHighPct! - b.offHighPct!), perSection),
      nearLow: top(built.filter((b) => b.offLowPct != null).sort((a, b) => a.offLowPct! - b.offLowPct!), perSection),
      universe: built.length,
    };
  } catch (err) {
    log.error('discover.discovery.failed', err);
    return EMPTY_DISCOVERY;
  }
}

/** Symbols the signed-in user already tracks, so search can say so. */
export async function getMySymbols(): Promise<string[]> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return [];
    await connectToDatabase();
    const rows = await Watchlist.find({ userId: session.user.id }, { symbol: 1 }).lean();
    return rows.map((r) => r.symbol);
  } catch {
    return [];
  }
}
