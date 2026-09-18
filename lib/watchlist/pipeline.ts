// The ingestion + detection pipeline. Shared by the Inngest cron (scheduled,
// fans out over every watched symbol) and the "Refresh now" server action
// (on-demand, just the current user's symbols). Reads never touch this — pages
// read materialized snapshots and change events.

import { connectToDatabase } from '@/database/mongoose';
import { Snapshot } from '@/database/models/snapshot.model';
import { Watchlist } from '@/database/models/watchlist.model';
import { ChangeEventModel } from '@/database/models/changeEvent.model';
import { SymbolEventModel } from '@/database/models/symbolEvent.model';
import { WatchedSymbolModel } from '@/database/models/watchedSymbol.model';
import { buildSnapshot } from '@/lib/market-data/snapshot';
import { detectChanges, volatilityFromChanges, type DetectedChange, type ChangeKind } from '@/lib/changes/detect';
import { tradingDaysUntil } from '@/lib/market';
import { log } from '@/lib/observability/logger';
import { isMarketOpenFor } from '@/lib/changes/exchange';

const MIN_SECONDS_BETWEEN_WRITES = 55; // collapse rapid manual refreshes
const MIN_SECONDS_BETWEEN_FETCHES = 45; // don't spend Finnhub quota on refresh spam

// Which detected changes are identical for everyone who watches the ticker
// (stored once, in SymbolEvent) vs. specific to a user's thesis (stored per-user,
// in ChangeEvent). This split is what makes detection O(symbols), not O(users).
const THESIS_SCOPED: ReadonlySet<ChangeKind> = new Set<ChangeKind>([
  'entered_entry_zone',
  'invalidation_breached',
  'target_reached',
]);

function isThesisScoped(c: DetectedChange): boolean {
  if (THESIS_SCOPED.has(c.type)) return true;
  // A catalyst alert is thesis-scoped only when it comes from the user's own
  // catalyst date; the earnings-derived one is symbol-scoped.
  return c.type === 'catalyst_imminent' && c.data?.label !== 'earnings';
}

function hasThesisLevels(item: {
  entryLow?: number; entryHigh?: number; invalidationPrice?: number; targetPrice?: number; catalystDate?: Date | null;
}): boolean {
  return (
    item.entryLow != null ||
    item.entryHigh != null ||
    item.invalidationPrice != null ||
    item.targetPrice != null ||
    item.catalystDate != null
  );
}

/**
 * Every symbol at least one person watches. Reads a refcounted index
 * (`WatchedSymbol`) — O(distinct symbols) — instead of `distinct()` over the
 * whole watchlist collection.
 */
export async function getDistinctWatchedSymbols(activeOnly = false): Promise<string[]> {
  await connectToDatabase();
  const q: Record<string, unknown> = { watchers: { $gt: 0 } };
  if (activeOnly) q.tier = 'active';
  const rows = await WatchedSymbolModel.find(q, { symbol: 1 }).lean();
  if (rows.length) return rows.map((r) => r.symbol.toUpperCase());

  // Cold start / pre-migration fallback: derive from the watchlist and backfill.
  const symbols = ((await Watchlist.distinct('symbol')) as string[]).map((s) => s.toUpperCase());
  await Promise.all(
    symbols.map((s) =>
      WatchedSymbolModel.updateOne({ symbol: s }, { $setOnInsert: { symbol: s }, $max: { watchers: 1 } }, { upsert: true }).catch(() => {})
    )
  );
  return symbols;
}

/** Maintain the WatchedSymbol refcount + tier when a user adds/removes/re-categorises. */
export async function bumpWatchedSymbol(symbol: string, delta: number, active = false): Promise<void> {
  await connectToDatabase();
  const sym = symbol.toUpperCase();
  await WatchedSymbolModel.updateOne(
    { symbol: sym },
    {
      $inc: { watchers: delta },
      $setOnInsert: { symbol: sym },
      $set: { updatedAt: new Date(), ...(active ? { tier: 'active' } : {}) },
    },
    { upsert: true }
  );
}

/**
 * Trailing daily % changes for a symbol — one point per calendar day so the
 * volatility estimate reflects ~20 trading days, not "the last 250 poll ticks"
 * (which during market hours would be only ~10 days).
 */
async function trailingDailyChanges(symbol: string, days = 25): Promise<number[]> {
  const since = new Date(Date.now() - (days + 15) * 864e5);
  const rows = await Snapshot.aggregate<{ _id: string; changePercent: number }>([
    { $match: { symbol, changePercent: { $ne: null }, capturedAt: { $gte: since } } },
    { $sort: { capturedAt: 1 } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$asOf' } },
        changePercent: { $last: '$changePercent' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => r.changePercent).filter((n) => typeof n === 'number' && Number.isFinite(n));
}

export interface RefreshResult {
  symbol: string;
  wrote: boolean;
  snapshotId?: string;
  events: number;
  error?: string;
}

/**
 * Fetch a fresh snapshot for one symbol, persist it (unless an almost-identical
 * one was just written), then run change detection against the *previous*
 * snapshot for every user who watches it.
 */
export async function refreshSymbol(symbol: string): Promise<RefreshResult> {
  const sym = symbol.toUpperCase();
  try {
    await connectToDatabase();

    const latest = await Snapshot.findOne({ symbol: sym }).sort({ capturedAt: -1 }).lean();
    const ageSeconds = latest ? (Date.now() - new Date(latest.capturedAt).getTime()) / 1000 : Infinity;

    // A very fresh snapshot exists — skip the 5-call Finnhub round-trip entirely.
    if (ageSeconds < MIN_SECONDS_BETWEEN_FETCHES && !latest!.stale) {
      return { symbol: sym, wrote: false, snapshotId: String(latest!._id), events: 0 };
    }

    const built = await buildSnapshot(sym);

    const priceUnchanged = latest && typeof built.price === 'number' && latest.price === built.price;
    if (ageSeconds < MIN_SECONDS_BETWEEN_WRITES && priceUnchanged && built.newsHash === latest!.newsHash) {
      return { symbol: sym, wrote: false, snapshotId: String(latest!._id), events: 0 };
    }

    const doc = await Snapshot.create(built);
    const prev = latest; // the row that was newest before this write
    const fromId = prev ? String(prev._id) : undefined;
    const toId = String(doc._id);

    // Cache "latest" for O(1) reads and stamp the poll time.
    await WatchedSymbolModel.updateOne(
      { symbol: sym },
      { $set: { latest: { ...built, _id: toId }, lastPolledAt: new Date(), updatedAt: new Date() }, $setOnInsert: { symbol: sym } },
      { upsert: true }
    ).catch(() => {});

    const volatility = volatilityFromChanges(await trailingDailyChanges(sym));
    const detectOpts = {
      volatility,
      // Per venue, not per server: an NSE listing's session closes hours
      // before the US one opens, so a single global flag would gate every
      // Indian move alert out of existence.
      marketOpen: isMarketOpenFor(sym),
      tradingDaysUntil: (d: Date | string | null | undefined) => tradingDaysUntil(d ?? null),
    };
    let events = 0;

    // --- Pass 1: symbol-level events (computed ONCE, shared by every watcher) --
    const anyItem = await Watchlist.findOne({ symbol: sym }, { company: 1, direction: 1, category: 1 }).lean();
    const symbolChanges = detectChanges(
      prev ?? null,
      built,
      { symbol: sym, company: anyItem?.company, category: anyItem?.category, direction: anyItem?.direction },
      detectOpts
    ).filter((c) => !isThesisScoped(c));

    for (const c of symbolChanges) {
      try {
        const r = await SymbolEventModel.updateOne(
          { dedupeKey: c.dedupeKey },
          { $setOnInsert: { symbol: sym, type: c.type, severity: c.severity, title: c.title, detail: c.detail, data: c.data, dedupeKey: c.dedupeKey, fromSnapshotId: fromId, toSnapshotId: toId, createdAt: new Date() } },
          { upsert: true }
        );
        events += r.upsertedCount ?? 0;
      } catch (e) {
        if (!(e instanceof Error && e.message.includes('E11000'))) throw e;
      }
    }

    // --- Pass 2: thesis-level events, only for users who actually set levels ---
    const thesisItems = await Watchlist.find({
      symbol: sym,
      $or: [
        { entryLow: { $ne: null } },
        { entryHigh: { $ne: null } },
        { invalidationPrice: { $ne: null } },
        { targetPrice: { $ne: null } },
        { catalystDate: { $ne: null } },
      ],
    }).lean();

    for (const item of thesisItems) {
      if (!hasThesisLevels(item)) continue;
      const thesisChanges = detectChanges(
        prev ?? null,
        built,
        {
          symbol: sym, company: item.company, category: item.category, direction: item.direction,
          entryLow: item.entryLow, entryHigh: item.entryHigh,
          invalidationPrice: item.invalidationPrice, targetPrice: item.targetPrice,
          catalystDate: item.catalystDate, catalystNote: item.catalystNote, notify: item.notify,
        },
        detectOpts
      ).filter(isThesisScoped);

      for (const c of thesisChanges) {
        try {
          const r = await ChangeEventModel.updateOne(
            { userId: item.userId, dedupeKey: c.dedupeKey },
            { $setOnInsert: { userId: item.userId, symbol: sym, type: c.type, severity: c.severity, title: c.title, detail: c.detail, data: c.data, dedupeKey: c.dedupeKey, fromSnapshotId: fromId, toSnapshotId: toId, createdAt: new Date() } },
            { upsert: true }
          );
          events += r.upsertedCount ?? 0;
        } catch (e) {
          if (!(e instanceof Error && e.message.includes('E11000'))) throw e;
        }
      }
    }

    return { symbol: sym, wrote: true, snapshotId: toId, events };
  } catch (e) {
    // Swallowed into the result so one bad symbol can't abort a whole poll
    // batch — but recorded, or an entire cron run can fail with no trace.
    log.error('pipeline.refresh_symbol.failed', e, { symbol: sym });
    return { symbol: sym, wrote: false, events: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function refreshSymbols(symbols: string[], concurrency = 4): Promise<RefreshResult[]> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const results: RefreshResult[] = [];
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    results.push(...(await Promise.all(batch.map(refreshSymbol))));
  }
  return results;
}

/**
 * Daily housekeeping: an "active" or "developing" item that hasn't generated a
 * single change event in 30 days is probably dead weight — surface a nudge to
 * re-examine or cull it (straight out of watchlist-discipline best practice).
 */
export async function flagStaleTheses(): Promise<number> {
  await connectToDatabase();
  const cutoff = new Date(Date.now() - 30 * 864e5);
  const monthKey = cutoff.toISOString().slice(0, 7);
  const BATCH = 500;

  // Streamed in batches via a cursor. The previous version did
  // `Watchlist.find({ category: {...} }).lean()` with no user filter, pulling
  // every active/developing item for every user into process memory — at a
  // million users that's tens of millions of documents and a guaranteed OOM.
  // Filtering by date moved into the query too, rather than in JS afterwards.
  const cursor = Watchlist.find({
    category: { $in: ['active', 'developing'] },
    addedAt: { $lte: cutoff },
    $or: [{ lastReviewedAt: { $exists: false } }, { lastReviewedAt: { $lte: cutoff } }],
  })
    .lean()
    .batchSize(BATCH)
    .cursor();

  let flagged = 0;
  let batch: { userId: string; symbol: string; company: string; category: string; addedAt: Date }[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const userIds = [...new Set(batch.map((i) => i.userId))];
    const syms = [...new Set(batch.map((i) => i.symbol))];

    // Scoped to this batch, so both queries stay small regardless of total size.
    const [thesisActive, symbolActive] = await Promise.all([
      ChangeEventModel.aggregate<{ _id: { userId: string; symbol: string } }>([
        { $match: { userId: { $in: userIds }, symbol: { $in: syms }, type: { $ne: 'thesis_stale' }, createdAt: { $gt: cutoff } } },
        { $group: { _id: { userId: '$userId', symbol: '$symbol' } } },
      ]),
      SymbolEventModel.distinct('symbol', { symbol: { $in: syms }, createdAt: { $gt: cutoff } }),
    ]);
    const activeSet = new Set(thesisActive.map((a) => `${a._id.userId}::${a._id.symbol}`));
    const activeSymbols = new Set(symbolActive as string[]);

    const ops = batch
      .filter((i) => !activeSet.has(`${i.userId}::${i.symbol}`) && !activeSymbols.has(i.symbol))
      .map((i) => {
        const dedupeKey = `thesis_stale:${i.symbol}:${monthKey}`;
        return {
          updateOne: {
            filter: { userId: i.userId, dedupeKey },
            update: {
              $setOnInsert: {
                userId: i.userId,
                symbol: i.symbol,
                type: 'thesis_stale',
                severity: 25,
                title: `${i.symbol} has gone quiet`,
                detail: `No meaningful change on ${i.company} in 30+ days. If you'd still add it today, keep it — otherwise cull it so the list stays actionable.`,
                data: { category: i.category, addedAt: i.addedAt },
                dedupeKey,
                createdAt: new Date(),
              },
            },
            upsert: true,
          },
        };
      });

    if (ops.length) {
      // One round-trip per batch instead of one per item.
      const res = await ChangeEventModel.bulkWrite(ops as never, { ordered: false }).catch(() => null);
      flagged += res?.upsertedCount ?? 0;
    }
    batch = [];
  };

  for await (const doc of cursor) {
    batch.push(doc as never);
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  return flagged;
}
