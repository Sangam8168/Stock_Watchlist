// Figures out *which* users have something worth emailing, so the digest cron
// fans out one job per active user instead of computing a digest for every user
// (most of whom are quiet on any given day).

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { ChangeEventModel } from '@/database/models/changeEvent.model';
import { SymbolEventModel } from '@/database/models/symbolEvent.model';

/** Page size for every cursor/aggregation below. Keeps memory flat. */
const PAGE = 1_000;

/**
 * Yields active user ids in pages, de-duplicated, without ever materialising the
 * full set.
 *
 * The previous implementation used `distinct('userId', …)`, which returns one
 * array of every matching id. That has two failure modes at scale: the array
 * lives in process memory, and MongoDB caps a `distinct` result at the 16MB BSON
 * limit — so past roughly half a million active users the command doesn't slow
 * down, it *errors*. Aggregation with `$group` + `allowDiskUse` has no such cap
 * and streams.
 *
 * Callers should dispatch each page as it arrives rather than collecting pages.
 */
export async function* activeUserIdPages(sinceHours = 24): AsyncGenerator<string[]> {
  await connectToDatabase();
  const since = new Date(Date.now() - sinceHours * 3600_000);
  const seen = new Set<string>();

  const emit = function* (ids: string[]): Generator<string[]> {
    const fresh = ids.filter((id) => id && !seen.has(id));
    for (const id of fresh) seen.add(id);
    for (let i = 0; i < fresh.length; i += PAGE) yield fresh.slice(i, i + PAGE);
  };

  // 1. Users with a thesis-level event of their own.
  const thesisCursor = ChangeEventModel.aggregate<{ _id: string }>([
    { $match: { createdAt: { $gt: since }, type: { $ne: 'thesis_stale' } } },
    { $group: { _id: '$userId' } },
  ])
    .allowDiskUse(true)
    .cursor({ batchSize: PAGE });

  let buf: string[] = [];
  for await (const row of thesisCursor) {
    buf.push(row._id);
    if (buf.length >= PAGE) { yield* emit(buf); buf = []; }
  }
  if (buf.length) yield* emit(buf);

  // 2. Users watching a symbol that had a shared event. Symbols are bounded by
  //    the number of distinct tickers (thousands), not users — safe to collect.
  const hotSymbols = (await SymbolEventModel.distinct('symbol', { createdAt: { $gt: since } })) as string[];
  if (!hotSymbols.length) return;

  // Chunk the $in as well: a single clause with thousands of symbols is a large
  // query document, and we want the index scan to stay predictable.
  for (let i = 0; i < hotSymbols.length; i += 500) {
    const chunk = hotSymbols.slice(i, i + 500);
    const watcherCursor = Watchlist.aggregate<{ _id: string }>([
      { $match: { symbol: { $in: chunk }, notify: true } },
      { $group: { _id: '$userId' } },
    ])
      .allowDiskUse(true)
      .cursor({ batchSize: PAGE });

    buf = [];
    for await (const row of watcherCursor) {
      buf.push(row._id);
      if (buf.length >= PAGE) { yield* emit(buf); buf = []; }
    }
    if (buf.length) yield* emit(buf);
  }
}

/**
 * Convenience wrapper for small deployments and tests. Not used by the cron —
 * it collects everything into one array, which is exactly what we avoid above.
 */
export async function usersWithRecentActivity(sinceHours = 24): Promise<string[]> {
  const out: string[] = [];
  for await (const page of activeUserIdPages(sinceHours)) out.push(...page);
  return out;
}
