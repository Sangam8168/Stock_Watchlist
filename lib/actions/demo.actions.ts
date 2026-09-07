'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { Snapshot } from '@/database/models/snapshot.model';
import { ChangeEventModel } from '@/database/models/changeEvent.model';
import { SymbolEventModel } from '@/database/models/symbolEvent.model';
import { WatchedSymbolModel } from '@/database/models/watchedSymbol.model';
import { auth } from '@/lib/better-auth/auth';
import { detectChanges, volatilityFromChanges } from '@/lib/changes/detect';
import { tradingDaysUntil } from '@/lib/market';
import { refreshSymbols, bumpWatchedSymbol } from '@/lib/watchlist/pipeline';

const THESIS_TYPES = new Set(['entered_entry_zone', 'invalidation_breached', 'target_reached']);
const isThesis = (c: { type: string; data: Record<string, unknown> }) =>
  THESIS_TYPES.has(c.type) || (c.type === 'catalyst_imminent' && c.data?.label !== 'earnings');

async function requireUser(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

// A realistic starter pipeline — each item carries a real thesis, entry band,
// invalidation and catalyst so change detection has something to judge against.
const DEMO_ITEMS = [
  { symbol: 'NVDA', company: 'NVIDIA', category: 'active', thesis: 'Pullback to the 50-day in a confirmed uptrend as an add', entryLow: 158, entryHigh: 168, invalidationPrice: 148, targetPrice: 210, catalystNote: 'earnings' },
  { symbol: 'MSFT', company: 'Microsoft', category: 'longterm', thesis: 'Add on any 10%+ pullback from highs', entryLow: 400, entryHigh: 420, invalidationPrice: 360, targetPrice: 520 },
  { symbol: 'CRWD', company: 'CrowdStrike', category: 'developing', thesis: 'Base at highs; watching for a volume breakout', entryLow: 300, entryHigh: 315, invalidationPrice: 270, targetPrice: 400 },
  { symbol: 'XOM', company: 'Exxon Mobil', category: 'active', thesis: 'Energy rotation; testing the 200-day as support', entryLow: 104, entryHigh: 110, invalidationPrice: 98, targetPrice: 130 },
  { symbol: 'LLY', company: 'Eli Lilly', category: 'longterm', thesis: 'Secular GLP-1 growth story; buy weakness', entryLow: 700, entryHigh: 740, invalidationPrice: 620, targetPrice: 1000 },
  { symbol: 'UBER', company: 'Uber', category: 'developing', thesis: 'Profitable growth; cup-and-handle forming', entryLow: 70, entryHigh: 76, invalidationPrice: 62, targetPrice: 105 },
  { symbol: 'JPM', company: 'JPMorgan Chase', category: 'earnings', thesis: 'Financials leader; watching Q-guidance into the print', entryLow: 200, entryHigh: 215, invalidationPrice: 185, targetPrice: 260 },
  { symbol: 'TSLA', company: 'Tesla', category: 'speculative', thesis: 'Reversal watch at major support; small size only', entryLow: 210, entryHigh: 230, invalidationPrice: 190, targetPrice: 320 },
] as const;

export async function seedDemoWatchlist(): Promise<{ ok: boolean; added: number }> {
  const userId = await requireUser();
  await connectToDatabase();

  const now = new Date();
  let added = 0;
  for (const { symbol, ...fields } of DEMO_ITEMS) {
    const res = await Watchlist.updateOne(
      { userId, symbol },
      {
        $set: { ...fields, notify: true, updatedAt: now },
        $setOnInsert: { userId, symbol, addedAt: now },
      },
      { upsert: true }
    );
    if (res.upsertedCount) {
      added++;
      await bumpWatchedSymbol(symbol, 1, fields.category === 'active');
    }
  }

  // Best-effort real baseline (needs a Finnhub key; harmless without one).
  refreshSymbols(DEMO_ITEMS.map((i) => i.symbol)).catch(() => {});

  revalidatePath('/watchlist');
  return { ok: true, added };
}

/**
 * Demo aid. Fabricates a "before" and "after" snapshot for each watched symbol
 * so the change engine produces a realistic "While you were away" feed without
 * waiting for real market movement or a data provider. It runs the *real*
 * detectChanges — the events are genuine engine output, only the price inputs
 * are synthetic.
 */
export async function simulateSinceYouLeft(): Promise<{ ok: boolean; events: number }> {
  const userId = await requireUser();
  await connectToDatabase();

  const items = await Watchlist.find({ userId }).lean();
  if (!items.length) return { ok: false, events: 0 };

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000);
  let events = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const mid =
      item.entryLow != null && item.entryHigh != null
        ? (item.entryLow + item.entryHigh) / 2
        : 100;

    // Rotate through a few scenarios so the feed is varied.
    const scenario = idx % 4;
    let beforePrice = mid * 1.06;
    let afterPrice = mid; // default: just entered the entry zone
    let afterChangePct = -5.7;
    let staleAfter = false;
    let newsBump = 0;

    if (scenario === 1 && item.invalidationPrice != null) {
      beforePrice = item.invalidationPrice * 1.03;
      afterPrice = item.invalidationPrice * 0.97; // broke invalidation
      afterChangePct = -8.2;
    } else if (scenario === 2) {
      beforePrice = mid;
      afterPrice = mid * 1.01;
      afterChangePct = 1.1;
      newsBump = 3; // news break, no price drama
    } else if (scenario === 3) {
      beforePrice = mid * 1.02;
      afterPrice = mid * 1.02;
      afterChangePct = 0.4;
      staleAfter = true; // data-quality event
    }

    // Keep synthetic snapshots minimal — only the fields each scenario exercises —
    // so a later real "Refresh now" doesn't diff against made-up P/E or 52w values.
    const before = await Snapshot.create({
      symbol: item.symbol,
      capturedAt: twoHoursAgo,
      asOf: twoHoursAgo,
      stale: false,
      source: 'demo',
      price: Number(beforePrice.toFixed(2)),
      changePercent: 0.3,
      newsHash: 'demo-before',
      newsCount: 3,
    });

    const afterBuilt = {
      symbol: item.symbol,
      asOf: now,
      stale: staleAfter,
      price: Number(afterPrice.toFixed(2)),
      changePercent: afterChangePct,
      newsHash: newsBump ? 'demo-after-news' : 'demo-before',
      newsCount: 3 + newsBump,
      topHeadline: newsBump ? `${item.company} announces a strategic partnership` : undefined,
      nextEarningsDate: scenario === 0 ? new Date(now.getTime() + 3 * 864e5) : undefined,
    };

    const after = await Snapshot.create({ ...afterBuilt, capturedAt: now, source: 'demo' });

    // Keep the WatchedSymbol.latest cache in step with the time-series. Reads go
    // through the cache, so leaving it behind would make "was → now" diff the
    // demo's before-snapshot against a stale real quote and show nothing.
    await WatchedSymbolModel.updateOne(
      { symbol: item.symbol },
      { $set: { latest: { ...afterBuilt, _id: after._id }, updatedAt: now }, $setOnInsert: { symbol: item.symbol } },
      { upsert: true }
    );

    const detected = detectChanges(before, afterBuilt, {
      symbol: item.symbol,
      company: item.company,
      category: item.category,
      direction: item.direction,
      entryLow: item.entryLow,
      entryHigh: item.entryHigh,
      invalidationPrice: item.invalidationPrice,
      targetPrice: item.targetPrice,
      catalystDate: item.catalystDate,
      catalystNote: item.catalystNote,
      notify: item.notify,
    }, {
      volatility: volatilityFromChanges([0.4, -0.6, 0.5, -0.3, 0.7, -0.5, 0.4]),
      marketOpen: true,
      tradingDaysUntil: (d) => tradingDaysUntil(d ?? null),
    });

    for (const c of detected) {
      const key = `${c.dedupeKey}:sim${Date.now()}:${idx}`;
      const base = {
        symbol: item.symbol,
        type: c.type,
        severity: c.severity,
        title: c.title,
        detail: c.detail,
        data: c.data,
        dedupeKey: key,
        fromSnapshotId: String(before._id),
        toSnapshotId: String(after._id),
        createdAt: new Date(now.getTime() - idx * 60_000),
      };
      try {
        const r = isThesis(c)
          ? await ChangeEventModel.updateOne({ userId, dedupeKey: key }, { $setOnInsert: { userId, ...base } }, { upsert: true })
          : await SymbolEventModel.updateOne({ dedupeKey: key }, { $setOnInsert: base }, { upsert: true });
        if (r.upsertedCount) events++;
      } catch {
        /* ignore dupes */
      }
    }
  }

  revalidatePath('/watchlist');
  return { ok: true, events };
}
