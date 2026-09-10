'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import { Watchlist, WATCHLIST_CATEGORIES, DEFAULT_LIST, type WatchlistCategory } from '@/database/models/watchlist.model';
import { Snapshot } from '@/database/models/snapshot.model';
import { WatchedSymbolModel } from '@/database/models/watchedSymbol.model';
import { ChangeEventModel } from '@/database/models/changeEvent.model';
import { SymbolEventModel } from '@/database/models/symbolEvent.model';
import { SeenStateModel, GLOBAL_SEEN_KEY } from '@/database/models/seenState.model';
import { auth } from '@/lib/better-auth/auth';
import { refreshSymbols, bumpWatchedSymbol } from '@/lib/watchlist/pipeline';
import { loadChangeEvents, type MergedEvent } from '@/lib/watchlist/changes-read';
import { tradingDaysUntil } from '@/lib/market';

async function getUser(): Promise<{ id: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ? { id: session.user.id, email: session.user.email } : null;
}

async function requireUser(): Promise<{ id: string; email: string }> {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

const EMPTY_DIGEST: SinceYouLeftDigest = {
  lastVisit: null,
  counts: { itemsTracked: 0, needsAttention: 0, invalidated: 0, quiet: 0, unseenEvents: 0 },
  groups: [],
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function latestSnapshotsFor(symbols: string[]): Promise<Record<string, LeanSnapshot>> {
  if (symbols.length === 0) return {};

  // Fast path: the poll caches the latest snapshot on WatchedSymbol → O(1) per symbol.
  const cached = await WatchedSymbolModel.find({ symbol: { $in: symbols }, latest: { $ne: null } }, { symbol: 1, latest: 1 }).lean();
  const out: Record<string, LeanSnapshot> = {};
  for (const c of cached) if (c.latest) out[c.symbol] = c.latest as unknown as LeanSnapshot;

  // Fall back to the time-series for anything not cached yet (pre-migration).
  const missing = symbols.filter((s) => !out[s]);
  if (missing.length) {
    const rows = await Snapshot.aggregate<{ _id: string; doc: LeanSnapshot }>([
      { $match: { symbol: { $in: missing } } },
      { $sort: { capturedAt: -1 } },
      { $group: { _id: '$symbol', doc: { $first: '$$ROOT' } } },
    ]);
    for (const r of rows) out[r._id] = r.doc;
  }
  return out;
}

/**
 * Last ~30 daily closes per symbol, oldest → newest, for row sparklines.
 * One aggregation: bucket snapshots by (symbol, calendar day), take the latest
 * price in each bucket, keep the most recent 30 days. Bounded output regardless
 * of how often the poll ran.
 */
async function priceHistoryFor(symbols: string[], days = 30): Promise<Record<string, number[]>> {
  if (symbols.length === 0) return {};
  const since = new Date(Date.now() - (days + 10) * 864e5);
  const rows = await Snapshot.aggregate<{ _id: string; prices: number[] }>([
    { $match: { symbol: { $in: symbols }, price: { $gt: 0 }, capturedAt: { $gte: since } } },
    { $sort: { capturedAt: 1 } },
    {
      $group: {
        _id: { symbol: '$symbol', day: { $dateToString: { format: '%Y-%m-%d', date: '$asOf' } } },
        price: { $last: '$price' },
      },
    },
    { $sort: { '_id.day': 1 } },
    { $group: { _id: '$_id.symbol', prices: { $push: '$price' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.prices.slice(-days)]));
}

function isMuted(mutedUntil?: Date | string | null): boolean {
  return !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
}

/**
 * The last snapshot per symbol taken at or before `at` — i.e. the state of the
 * world the last time you looked. Paired with the latest snapshot this gives a
 * literal "was → now" for every number on the page.
 */
async function snapshotsAsOf(symbols: string[], at: Date): Promise<Record<string, LeanSnapshot>> {
  if (symbols.length === 0) return {};
  const rows = await Snapshot.aggregate<{ _id: string; doc: LeanSnapshot }>([
    { $match: { symbol: { $in: symbols }, capturedAt: { $lte: at } } },
    { $sort: { capturedAt: -1 } },
    { $group: { _id: '$symbol', doc: { $first: '$$ROOT' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.doc]));
}

function buildDeltas(
  before: LeanSnapshot | null,
  after: LeanSnapshot | null,
  item: { entryLow?: number; entryHigh?: number; direction?: string }
): ValueDelta[] {
  if (!before || !after) return [];
  const out: ValueDelta[] = [];
  const good = item.direction === 'short' ? 'down' : 'up';

  if (before.price != null && after.price != null && before.price !== after.price) {
    out.push({ label: 'Price', before: before.price, after: after.price, kind: 'price', goodDirection: good });
  }
  const dBefore = entryDistancePct(before.price ?? null, item.entryLow, item.entryHigh);
  const dAfter = entryDistancePct(after.price ?? null, item.entryLow, item.entryHigh);
  if (dBefore != null && dAfter != null && Math.abs(dBefore - dAfter) > 0.05) {
    out.push({ label: 'Distance to entry', before: dBefore, after: dAfter, kind: 'percent', goodDirection: 'toward-zero' });
  }
  if (before.peRatio != null && after.peRatio != null && Math.abs(before.peRatio - after.peRatio) > 0.05) {
    out.push({ label: 'P/E', before: before.peRatio, after: after.peRatio, kind: 'ratio' });
  }
  if (before.newsCount != null && after.newsCount != null && after.newsCount !== before.newsCount) {
    out.push({ label: 'Articles (5d)', before: before.newsCount, after: after.newsCount, kind: 'plain' });
  }
  return out;
}

/**
 * When a device is seen for the first time, seed its "caught up" watermark from
 * the furthest-along watermark on the user's *other* devices — so opening the
 * app on a new phone doesn't surface three weeks of history you already triaged
 * on your laptop. A genuinely new user (no other device) starts at 0 on purpose.
 */
export async function ensureSeenBaseline(deviceId: string): Promise<{ ok: boolean }> {
  const user = await getUser();
  if (!user || !deviceId) return { ok: false };
  await connectToDatabase();

  const mine = await SeenStateModel.findOne({ userId: user.id, deviceId, symbol: GLOBAL_SEEN_KEY }).lean();
  if (mine) return { ok: true };

  const others = await SeenStateModel.find({ userId: user.id, symbol: GLOBAL_SEEN_KEY }).sort({ lastSeenAt: -1 }).limit(1).lean();
  if (!others.length) return { ok: true }; // truly new — let everything show

  await SeenStateModel.updateOne(
    { userId: user.id, deviceId, symbol: GLOBAL_SEEN_KEY },
    { $setOnInsert: { userId: user.id, deviceId, symbol: GLOBAL_SEEN_KEY, lastSeenAt: others[0].lastSeenAt } },
    { upsert: true }
  );
  return { ok: true };
}

/**
 * Unseen-count for the nav badge. It has to agree with the digest, so it uses
 * the *same* rules: per-symbol watermarks (not just the global one) and muted
 * items excluded. Reviewing symbols one at a time never advances the global
 * watermark, so a global-only count would sit at "9+" forever while the panel
 * says everything is quiet.
 *
 * Cost stays bounded: one small watermark read plus two counts whose `$or` has
 * one clause per watched symbol.
 */
export async function getUnseenCount(deviceId: string): Promise<number> {
  const user = await getUser();
  if (!user || !deviceId) return 0;
  await connectToDatabase();

  const [items, watermarks] = await Promise.all([
    Watchlist.find({ userId: user.id }, { symbol: 1, mutedUntil: 1 }).lean(),
    seenWatermarks(user.id, deviceId),
  ]);
  const globalMs = watermarks[GLOBAL_SEEN_KEY] ?? 0;

  const clauses = items
    .filter((i) => !isMuted(i.mutedUntil))
    .map((i) => ({ symbol: i.symbol, createdAt: { $gt: new Date(watermarks[i.symbol] ?? globalMs) } }));
  if (!clauses.length) return 0;

  const [thesis, symbol] = await Promise.all([
    ChangeEventModel.countDocuments({ userId: user.id, type: { $ne: 'thesis_stale' }, $or: clauses }),
    SymbolEventModel.countDocuments({ $or: clauses }),
  ]);
  return thesis + symbol;
}

/** The user's caught-up watermark per symbol (max of per-symbol and global). */
async function seenWatermarks(userId: string, deviceId: string): Promise<Record<string, number>> {
  const rows = await SeenStateModel.find({ userId, deviceId }).lean();
  const global = rows.find((r) => r.symbol === GLOBAL_SEEN_KEY);
  const globalMs = global ? new Date(global.lastSeenAt).getTime() : 0;
  const map: Record<string, number> = { [GLOBAL_SEEN_KEY]: globalMs };
  for (const r of rows) {
    if (r.symbol === GLOBAL_SEEN_KEY) continue;
    map[r.symbol] = Math.max(globalMs, new Date(r.lastSeenAt).getTime());
  }
  return map;
}

export async function getWatchlist(deviceId: string): Promise<WatchlistEntry[]> {
  const user = await getUser();
  if (!user) return [];
  await connectToDatabase();

  const items = await Watchlist.find({ userId: user.id }).sort({ addedAt: -1 }).lean();
  const symbols = items.map((i) => i.symbol);
  const [snaps, watermarks, history] = await Promise.all([
    latestSnapshotsFor(symbols),
    seenWatermarks(user.id, deviceId),
    priceHistoryFor(symbols),
  ]);

  const eventsBySymbol = await loadChangeEvents(user.id, symbols, { perSymbolCap: 12 });

  return items.map((item) => {
    const snap = snaps[item.symbol] ?? null;
    const watermark = watermarks[item.symbol] ?? watermarks[GLOBAL_SEEN_KEY] ?? 0;
    const symEvents = eventsBySymbol.get(item.symbol) ?? [];
    const unseen = symEvents.filter((e) => new Date(e.createdAt).getTime() > watermark);
    const catalystDays = tradingDaysUntil(item.catalystDate ?? snap?.nextEarningsDate ?? null);

    return {
      symbol: item.symbol,
      company: item.company,
      list: item.list || DEFAULT_LIST,
      category: item.category,
      thesis: item.thesis ?? null,
      direction: item.direction ?? 'long',
      entryLow: item.entryLow ?? null,
      entryHigh: item.entryHigh ?? null,
      invalidationPrice: item.invalidationPrice ?? null,
      targetPrice: item.targetPrice ?? null,
      catalystDate: item.catalystDate ? new Date(item.catalystDate).toISOString() : null,
      catalystNote: item.catalystNote ?? null,
      catalystTradingDays: catalystDays,
      notify: item.notify,
      mutedUntil: isMuted(item.mutedUntil) ? new Date(item.mutedUntil!).toISOString() : null,
      owned: !!item.owned,
      ownedAt: item.ownedAt ? new Date(item.ownedAt).toISOString() : null,
      ownedPrice: item.ownedPrice ?? null,
      ownedReturnPct:
        item.owned && item.ownedPrice && item.ownedPrice > 0 && snap?.price != null
          ? ((snap.price - item.ownedPrice) / item.ownedPrice) * 100
          : null,
      lastReviewedAt: item.lastReviewedAt ? new Date(item.lastReviewedAt).toISOString() : null,
      daysSinceReview: Math.floor(
        (Date.now() - new Date(item.lastReviewedAt ?? item.updatedAt ?? item.addedAt).getTime()) / 864e5
      ),
      addedAt: new Date(item.addedAt).toISOString(),
      priceHistory: history[item.symbol] ?? [],
      price: snap?.price ?? null,
      changePercent: snap?.changePercent ?? null,
      week52High: snap?.week52High ?? null,
      week52Low: snap?.week52Low ?? null,
      marketCap: snap?.marketCap ?? null,
      peRatio: snap?.peRatio ?? null,
      dataAsOf: snap ? new Date(snap.asOf).toISOString() : null,
      stale: snap?.stale ?? true,
      unconfirmedFields: snap?.unconfirmedFields ?? [],
      distanceToEntryPct: entryDistancePct(snap?.price ?? null, item.entryLow, item.entryHigh),
      unseenCount: unseen.length,
      topUnseenSeverity: unseen.reduce((m, e) => Math.max(m, e.severity), 0),
      events: symEvents.slice(0, 12).map(serializeEvent),
    };
  });
}

/** Single enriched entry for a symbol (stock detail page). Null if not watched. */
export async function getWatchlistEntry(symbol: string, deviceId: string): Promise<WatchlistEntry | null> {
  const sym = symbol.trim().toUpperCase();
  const all = await getWatchlist(deviceId);
  return all.find((e) => e.symbol === sym) ?? null;
}

function entryDistancePct(price: number | null, low?: number, high?: number): number | null {
  if (price == null || typeof low !== 'number' || typeof high !== 'number') return null;
  if (low <= 0 || high < low) return null; // invalid band
  if (price >= low && price <= high) return 0;
  const target = price < low ? low : high;
  return target > 0 ? ((price - target) / target) * 100 : null;
}

function serializeEvent(e: {
  symbol: string; type: string; severity: number; title: string; detail: string;
  createdAt: Date; data: Record<string, unknown>;
}): SerializedChangeEvent {
  return {
    symbol: e.symbol,
    type: e.type,
    severity: e.severity,
    title: e.title,
    detail: e.detail,
    createdAt: new Date(e.createdAt).toISOString(),
    data: e.data,
  };
}

/**
 * The "While you were away" digest. Compares every change event against the
 * user's per-device caught-up watermark and buckets the watchlist into
 * needs-attention / invalidated / quiet.
 */
export async function getSinceYouLeft(deviceId: string): Promise<SinceYouLeftDigest> {
  const user = await getUser();
  if (!user) return EMPTY_DIGEST;
  await connectToDatabase();

  const items = await Watchlist.find({ userId: user.id }).lean();
  const symbols = items.map((i) => i.symbol);
  const watermarks = await seenWatermarks(user.id, deviceId);
  const globalMs = watermarks[GLOBAL_SEEN_KEY] ?? 0;

  const eventsBySymbol = await loadChangeEvents(user.id, symbols, { perSymbolCap: 20 });

  // Snoozed items don't shout at you until the mute expires.
  const mutedSymbols = new Set(items.filter((i) => isMuted(i.mutedUntil)).map((i) => i.symbol));

  const bySymbol = new Map<string, MergedEvent[]>();
  for (const [sym, evs] of eventsBySymbol) {
    if (mutedSymbols.has(sym)) continue;
    const wm = watermarks[sym] ?? globalMs;
    const fresh = evs.filter((e) => e.createdAt.getTime() > wm);
    if (fresh.length) bySymbol.set(sym, fresh);
  }
  const unseen = [...bySymbol.values()].flat();

  const invalidatedSymbols = new Set(unseen.filter((e) => e.type === 'invalidation_breached').map((e) => e.symbol));
  const attentionSymbols = new Set(
    unseen.filter((e) => e.severity >= 50 && e.type !== 'invalidation_breached').map((e) => e.symbol)
  );

  // Literal was → now values across the away-window, for the symbols that changed.
  const changedSymbols = [...bySymbol.keys()];
  const [beforeSnaps, afterSnaps] = await Promise.all([
    globalMs
      ? snapshotsAsOf(changedSymbols, new Date(globalMs))
      : Promise.resolve({} as Record<string, LeanSnapshot>),
    latestSnapshotsFor(changedSymbols),
  ]);

  return {
    lastVisit: globalMs ? new Date(globalMs).toISOString() : null,
    counts: {
      itemsTracked: items.length,
      needsAttention: attentionSymbols.size,
      invalidated: invalidatedSymbols.size,
      quiet: items.length - mutedSymbols.size - new Set(unseen.map((e) => e.symbol)).size,
      unseenEvents: unseen.length,
    },
    groups: [...bySymbol.entries()]
      .map(([symbol, evs]) => {
        const item = items.find((i) => i.symbol === symbol);
        return {
          symbol,
          company: item?.company ?? symbol,
          maxSeverity: evs.reduce((m, e) => Math.max(m, e.severity), 0),
          events: evs.map(serializeEvent),
          deltas: buildDeltas(beforeSnaps[symbol] ?? null, afterSnaps[symbol] ?? null, {
            entryLow: item?.entryLow,
            entryHigh: item?.entryHigh,
            direction: item?.direction,
          }),
        };
      })
      .sort((a, b) => b.maxSeverity - a.maxSeverity),
  };
}

/**
 * Full chronological change feed — everything that happened in a window,
 * regardless of whether you've already reviewed it. The "While you were away"
 * panel answers *what's new*; this answers *what has this list been doing*.
 */
export async function getChangeHistory(days = 7): Promise<ChangeHistoryEntry[]> {
  const user = await getUser();
  if (!user) return [];
  await connectToDatabase();

  const items = await Watchlist.find({ userId: user.id }, { symbol: 1, company: 1 }).lean();
  if (!items.length) return [];
  const nameOf = new Map(items.map((i) => [i.symbol, i.company]));

  const since = new Date(Date.now() - days * 864e5);
  const bySymbol = await loadChangeEvents(user.id, items.map((i) => i.symbol), { since, hardCap: 800 });

  return [...bySymbol.values()]
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 300)
    .map((e) => ({
      ...serializeEvent(e),
      company: nameOf.get(e.symbol) ?? e.symbol,
      scope: e.scope,
    }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Split a patch into `$set` and `$unset`. Mongoose silently drops `undefined`
 * from an update, so "clear this field" has to be an explicit `$unset` — without
 * this, an entry zone or invalidation level could never be removed once set.
 */
function splitSetUnset(fields: Record<string, unknown>): {
  $set: Record<string, unknown>;
  $unset?: Record<string, 1>;
} {
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null) unset[k] = 1;
    else if (v !== undefined) set[k] = v;
  }
  return Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set };
}

export async function addToWatchlist(input: AddWatchlistInput): Promise<{ ok: boolean; error?: string }> {
  // Return rather than throw: an expired session is an expected outcome here,
  // and a thrown server action surfaces to the client as a silent rejection.
  const user = await getUser();
  if (!user) return { ok: false, error: 'Your session expired — please sign in again.' };
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, error: 'Symbol required' };

  try {
    await connectToDatabase();
    const existed = await Watchlist.exists({ userId: user.id, symbol });
    const category = WATCHLIST_CATEGORIES.includes(input.category as WatchlistCategory) ? input.category : 'developing';
    const { $set, $unset } = splitSetUnset({
      company: input.company?.trim() || symbol,
      list: input.list?.trim() || DEFAULT_LIST,
      category,
      thesis: input.thesis === null ? null : input.thesis?.trim() || null,
      direction: input.direction === 'short' ? 'short' : 'long',
      entryLow: input.entryLow,
      entryHigh: input.entryHigh,
      invalidationPrice: input.invalidationPrice,
      targetPrice: input.targetPrice,
      catalystDate: input.catalystDate ? new Date(input.catalystDate) : null,
      catalystNote: input.catalystNote === null ? null : input.catalystNote?.trim() || null,
      notify: input.notify ?? true,
      updatedAt: new Date(),
    });
    await Watchlist.updateOne(
      { userId: user.id, symbol },
      {
        $set,
        ...($unset ? { $unset } : {}),
        $setOnInsert: { userId: user.id, symbol, addedAt: new Date() },
      },
      { upsert: true }
    );

    if (!existed) await bumpWatchedSymbol(symbol, 1, category === 'active');
    else if (category === 'active') await bumpWatchedSymbol(symbol, 0, true);

    // Establish a baseline snapshot immediately so the first real change is detectable.
    refreshSymbols([symbol]).catch((e) => console.error('baseline refresh failed', e));

    revalidatePath('/watchlist');
    revalidatePath(`/stocks/${symbol}`);
    return { ok: true };
  } catch (e) {
    console.error('addToWatchlist error', e);
    return { ok: false, error: 'Could not add to watchlist' };
  }
}

export async function removeFromWatchlist(symbol: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const sym = symbol.trim().toUpperCase();
  await connectToDatabase();
  const res = await Watchlist.deleteOne({ userId: user.id, symbol: sym });
  if (res.deletedCount) {
    await bumpWatchedSymbol(sym, -1);
    // Clean up this user's per-symbol state for the ticker (SymbolEvents are shared, keep).
    await Promise.all([
      ChangeEventModel.deleteMany({ userId: user.id, symbol: sym }),
      SeenStateModel.deleteMany({ userId: user.id, symbol: sym }),
    ]);
  }
  revalidatePath('/watchlist');
  revalidatePath(`/stocks/${sym}`);
  return { ok: true };
}

export async function updateWatchlistItem(
  symbol: string,
  patch: Partial<AddWatchlistInput>
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await connectToDatabase();

  // null → clear the field, undefined → leave it untouched. See splitSetUnset.
  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.category && WATCHLIST_CATEGORIES.includes(patch.category)) fields.category = patch.category;
  if (patch.list !== undefined) fields.list = patch.list?.trim() || DEFAULT_LIST;
  if (patch.direction === 'long' || patch.direction === 'short') fields.direction = patch.direction;
  if (patch.thesis !== undefined) fields.thesis = patch.thesis === null ? null : patch.thesis.trim() || null;
  for (const k of ['entryLow', 'entryHigh', 'invalidationPrice', 'targetPrice'] as const) {
    if (patch[k] !== undefined) fields[k] = patch[k];
  }
  if (patch.catalystDate !== undefined) fields.catalystDate = patch.catalystDate ? new Date(patch.catalystDate) : null;
  if (patch.catalystNote !== undefined) {
    fields.catalystNote = patch.catalystNote === null ? null : patch.catalystNote.trim() || null;
  }
  if (patch.notify !== undefined) fields.notify = patch.notify;

  const sym = symbol.trim().toUpperCase();
  const { $set, $unset } = splitSetUnset(fields);
  await Watchlist.updateOne({ userId: user.id, symbol: sym }, { $set, ...($unset ? { $unset } : {}) });
  if (patch.category === 'active') await bumpWatchedSymbol(sym, 0, true);
  revalidatePath('/watchlist');
  revalidatePath(`/stocks/${sym}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Watchlist → Portfolio
// ---------------------------------------------------------------------------

/**
 * "After purchasing a stock, move it from your watchlist to your portfolio."
 * The thesis, levels and change history all come with it — a position needs
 * *more* monitoring than a candidate, not less — but it leaves the candidate
 * pipeline so the watchlist stays a list of things you might buy.
 */
export async function moveToPortfolio(symbol: string, ownedPrice?: number): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await connectToDatabase();
  const sym = symbol.trim().toUpperCase();
  const res = await Watchlist.updateOne(
    { userId: user.id, symbol: sym },
    { $set: { owned: true, ownedAt: new Date(), ...(ownedPrice ? { ownedPrice } : {}), updatedAt: new Date() } }
  );
  revalidatePath('/watchlist');
  return { ok: res.matchedCount > 0 };
}

/** Sold it / changed your mind — back to the candidate pipeline. */
export async function returnToWatchlist(symbol: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await connectToDatabase();
  const res = await Watchlist.updateOne(
    { userId: user.id, symbol: symbol.trim().toUpperCase() },
    { $set: { owned: false, updatedAt: new Date() }, $unset: { ownedAt: 1, ownedPrice: 1 } }
  );
  revalidatePath('/watchlist');
  return { ok: res.matchedCount > 0 };
}

/** Stamp "I looked at this and it still belongs" — powers the review-cadence nudge. */
export async function markThesisReviewed(symbols: string[]): Promise<{ ok: boolean; updated: number }> {
  const user = await requireUser();
  const list = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(Boolean);
  if (!list.length) return { ok: true, updated: 0 };
  await connectToDatabase();
  const res = await Watchlist.updateMany(
    { userId: user.id, symbol: { $in: list } },
    { $set: { lastReviewedAt: new Date() } }
  );
  revalidatePath('/watchlist');
  return { ok: true, updated: res.modifiedCount ?? 0 };
}

// ---------------------------------------------------------------------------
// Bulk operations (row-selection toolbar)
// ---------------------------------------------------------------------------

export async function bulkRemoveFromWatchlist(symbols: string[]): Promise<{ ok: boolean; removed: number }> {
  const user = await requireUser();
  const list = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(Boolean);
  if (!list.length) return { ok: true, removed: 0 };
  await connectToDatabase();

  const res = await Watchlist.deleteMany({ userId: user.id, symbol: { $in: list } });
  await Promise.all([
    ...list.map((s) => bumpWatchedSymbol(s, -1)),
    ChangeEventModel.deleteMany({ userId: user.id, symbol: { $in: list } }),
    SeenStateModel.deleteMany({ userId: user.id, symbol: { $in: list } }),
  ]);
  revalidatePath('/watchlist');
  return { ok: true, removed: res.deletedCount ?? 0 };
}

/**
 * The user's named lists, derived from the items themselves. "Main" is always
 * offered so there's somewhere to move things back to.
 *
 * Note lists are a *view* concept only: detection, the digest and alerts all run
 * across every item a user owns, regardless of list. You want to know your thesis
 * broke whichever tab you happened to have open.
 */
export async function getWatchlistNames(): Promise<{ name: string; count: number }[]> {
  const user = await getUser();
  if (!user) return [];
  await connectToDatabase();
  const rows = await Watchlist.aggregate<{ _id: string | null; n: number }>([
    { $match: { userId: user.id } },
    { $group: { _id: '$list', n: { $sum: 1 } } },
  ]);
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r._id || DEFAULT_LIST, (counts.get(r._id || DEFAULT_LIST) ?? 0) + r.n);
  if (!counts.has(DEFAULT_LIST)) counts.set(DEFAULT_LIST, 0);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((x, y) => (x.name === DEFAULT_LIST ? -1 : y.name === DEFAULT_LIST ? 1 : x.name.localeCompare(y.name)));
}

/**
 * Remove a list without removing the research in it: its items move back to
 * "Main". Deleting the theses themselves is a separate, explicit action
 * (bulkRemoveFromWatchlist) — losing an entry zone and an invalidation level to
 * a mis-click on a tab would be a bad trade.
 */
export async function deleteList(name: string): Promise<{ ok: boolean; moved: number; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, moved: 0, error: 'Not signed in' };
  if (name === DEFAULT_LIST) return { ok: false, moved: 0, error: `"${DEFAULT_LIST}" can't be deleted` };
  await connectToDatabase();
  const res = await Watchlist.updateMany(
    { userId: user.id, list: name },
    { $set: { list: DEFAULT_LIST, updatedAt: new Date() } }
  );
  revalidatePath('/watchlist');
  return { ok: true, moved: res.modifiedCount ?? 0 };
}

/** Move selected symbols into a list, creating it implicitly if it's new. */
export async function bulkMoveToList(symbols: string[], list: string): Promise<{ ok: boolean; updated: number }> {
  const user = await getUser();
  if (!user) return { ok: false, updated: 0 };
  const name = list.trim().slice(0, 40) || DEFAULT_LIST;
  const items = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(Boolean);
  if (!items.length) return { ok: true, updated: 0 };
  await connectToDatabase();
  const res = await Watchlist.updateMany(
    { userId: user.id, symbol: { $in: items } },
    { $set: { list: name, updatedAt: new Date() } }
  );
  revalidatePath('/watchlist');
  return { ok: true, updated: res.modifiedCount ?? 0 };
}

/** Rename a list in place. Deleting one just means moving its items elsewhere. */
export async function renameList(from: string, to: string): Promise<{ ok: boolean; updated: number }> {
  const user = await getUser();
  if (!user) return { ok: false, updated: 0 };
  const target = to.trim().slice(0, 40);
  if (!target || target === from) return { ok: false, updated: 0 };
  await connectToDatabase();
  const res = await Watchlist.updateMany(
    { userId: user.id, ...(from === DEFAULT_LIST ? { $or: [{ list: from }, { list: { $exists: false } }] } : { list: from }) },
    { $set: { list: target, updatedAt: new Date() } }
  );
  revalidatePath('/watchlist');
  return { ok: true, updated: res.modifiedCount ?? 0 };
}

export async function bulkSetCategory(
  symbols: string[],
  category: WatchlistCategory
): Promise<{ ok: boolean; updated: number }> {
  const user = await requireUser();
  if (!WATCHLIST_CATEGORIES.includes(category)) return { ok: false, updated: 0 };
  const list = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(Boolean);
  if (!list.length) return { ok: true, updated: 0 };
  await connectToDatabase();

  const res = await Watchlist.updateMany(
    { userId: user.id, symbol: { $in: list } },
    { $set: { category, updatedAt: new Date() } }
  );
  if (category === 'active') await Promise.all(list.map((s) => bumpWatchedSymbol(s, 0, true)));
  revalidatePath('/watchlist');
  return { ok: true, updated: res.modifiedCount ?? 0 };
}

export async function bulkSnooze(symbols: string[], days: number | null): Promise<{ ok: boolean; updated: number }> {
  const user = await requireUser();
  const list = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(Boolean);
  if (!list.length) return { ok: true, updated: 0 };
  await connectToDatabase();

  const until = days && days > 0 ? new Date(Date.now() + days * 864e5) : null;
  const res = await Watchlist.updateMany(
    { userId: user.id, symbol: { $in: list } },
    until ? { $set: { mutedUntil: until } } : { $unset: { mutedUntil: 1 } }
  );
  revalidatePath('/watchlist');
  return { ok: true, updated: res.modifiedCount ?? 0 };
}

/** Nuke the whole watchlist for this user (Options → Delete everything). */
export async function clearWatchlist(): Promise<{ ok: boolean; removed: number }> {
  const user = await requireUser();
  await connectToDatabase();
  const items = await Watchlist.find({ userId: user.id }, { symbol: 1 }).lean();
  const symbols = items.map((i) => i.symbol);
  const res = await Watchlist.deleteMany({ userId: user.id });
  await Promise.all([
    ...symbols.map((s) => bumpWatchedSymbol(s, -1)),
    ChangeEventModel.deleteMany({ userId: user.id }),
    SeenStateModel.deleteMany({ userId: user.id }),
  ]);
  revalidatePath('/watchlist');
  return { ok: true, removed: res.deletedCount ?? 0 };
}

/**
 * Snooze alerts for one item. `days` null/0 clears the mute; otherwise mute for
 * that many days (e.g. through an earnings print you don't want pinged about).
 */
export async function snoozeWatchlistItem(symbol: string, days: number | null): Promise<{ ok: boolean; until: string | null }> {
  const user = await requireUser();
  await connectToDatabase();
  const until = days && days > 0 ? new Date(Date.now() + days * 864e5) : null;
  const res = await Watchlist.updateOne(
    { userId: user.id, symbol: symbol.trim().toUpperCase() },
    until ? { $set: { mutedUntil: until } } : { $unset: { mutedUntil: 1 } }
  );
  if (res.matchedCount === 0) return { ok: false, until: null };
  revalidatePath('/watchlist');
  return { ok: true, until: until ? until.toISOString() : null };
}

/**
 * Advance the caught-up watermark. Monotonic ($max) so a stale request or a
 * slower device can never move it backwards and re-hide things you've seen.
 */
export async function markSeen(deviceId: string, symbols?: string[]): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!deviceId) return { ok: false };
  await connectToDatabase();
  const now = new Date();
  const targets = symbols && symbols.length ? symbols.map((s) => s.toUpperCase()) : [GLOBAL_SEEN_KEY];

  await Promise.all(
    targets.map((symbol) =>
      SeenStateModel.updateOne(
        { userId: user.id, deviceId, symbol },
        { $max: { lastSeenAt: now }, $setOnInsert: { userId: user.id, deviceId, symbol } },
        { upsert: true }
      )
    )
  );
  revalidatePath('/watchlist');
  return { ok: true };
}

/** On-demand refresh of just this user's symbols — powers the "Refresh now" button. */
export async function refreshMyWatchlist(): Promise<{ ok: boolean; symbols: number; events: number }> {
  const user = await requireUser();
  await connectToDatabase();
  const items = await Watchlist.find({ userId: user.id }, { symbol: 1 }).lean();
  const results = await refreshSymbols(items.map((i) => i.symbol));
  revalidatePath('/watchlist');
  return {
    ok: true,
    symbols: results.length,
    events: results.reduce((n, r) => n + r.events, 0),
  };
}

/**
 * Send the "what changed" digest email to the signed-in user right now — the
 * same content the weekday cron sends, on demand. Lets you verify email setup
 * and see the format without waiting for 12:30 UTC.
 */
/** Reserved domains that accept mail nowhere — RFC 2606 / 6761. */
const UNDELIVERABLE_DOMAINS = ['example.com', 'example.org', 'example.net', 'test', 'invalid', 'localhost'];

export async function sendTestDigest(hours = 72): Promise<{ ok: boolean; reason?: string; sentTo?: string }> {
  const user = await requireUser();

  if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
    return { ok: false, reason: 'Email isn’t configured — set NODEMAILER_EMAIL and NODEMAILER_PASSWORD in .env' };
  }

  // The digest goes to the signed-in account's address. Demo accounts on
  // reserved domains swallow it silently, which looks exactly like a bug.
  const domain = user.email.split('@')[1]?.toLowerCase() ?? '';
  if (UNDELIVERABLE_DOMAINS.includes(domain)) {
    return {
      ok: false,
      reason: `You're signed in as ${user.email}. That domain can't receive mail, so nothing would arrive — sign in with a real address to get the digest.`,
    };
  }

  const { buildUserDigest } = await import('@/lib/watchlist/digest');
  const { sendWatchlistDigestEmail } = await import('@/lib/nodemailer');

  const digest = await buildUserDigest(user.id, hours);
  if (!digest.hasContent) {
    return { ok: false, reason: `Nothing to report in the last ${hours}h — try "Simulate" first` };
  }

  try {
    await sendWatchlistDigestEmail({
      email: user.email,
      date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      summaryLine: digest.summaryLine,
      body: digest.bodyHtml,
      watchlistUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/watchlist`,
    });
    return { ok: true, sentTo: user.email };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Send failed' };
  }
}

// ---------------------------------------------------------------------------
// Kept for the existing Inngest daily-news function
// ---------------------------------------------------------------------------

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
  if (!email) return [];
  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');
    const user = await db.collection('user').findOne<{ _id?: unknown; id?: string }>({ email });
    if (!user) return [];
    const userId = (user.id as string) || String(user._id || '');
    if (!userId) return [];
    const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
    return items.map((i) => String(i.symbol));
  } catch (err) {
    console.error('getWatchlistSymbolsByEmail error:', err);
    return [];
  }
}
