// Shared read path for "what changed": unions the per-user thesis events
// (`ChangeEvent`) with the shared symbol-level events (`SymbolEvent`). Every
// surface — the watchlist, the "while you were away" digest, the stock page,
// the email — reads through here so the two event stores stay consistent.

import { ChangeEventModel } from '@/database/models/changeEvent.model';
import { SymbolEventModel } from '@/database/models/symbolEvent.model';

export interface MergedEvent {
  symbol: string;
  type: string;
  severity: number;
  title: string;
  detail: string;
  createdAt: Date;
  data: Record<string, unknown>;
  scope: 'thesis' | 'symbol';
}

interface Options {
  since?: Date;      // only events after this time
  perSymbolCap?: number; // keep at most this many per symbol after merge
  hardCap?: number;  // safety cap on rows pulled from each store
}

export async function loadChangeEvents(
  userId: string,
  symbols: string[],
  opts: Options = {}
): Promise<Map<string, MergedEvent[]>> {
  const out = new Map<string, MergedEvent[]>();
  if (symbols.length === 0) return out;

  const sinceFilter = opts.since ? { createdAt: { $gt: opts.since } } : {};
  const hardCap = opts.hardCap ?? 600;

  const [thesis, symbol] = await Promise.all([
    ChangeEventModel.find({ userId, symbol: { $in: symbols }, ...sinceFilter })
      .sort({ createdAt: -1 })
      .limit(hardCap)
      .lean(),
    SymbolEventModel.find({ symbol: { $in: symbols }, ...sinceFilter })
      .sort({ createdAt: -1 })
      .limit(hardCap)
      .lean(),
  ]);

  const push = (e: {
    symbol: string; type: string; severity: number; title: string; detail: string;
    createdAt: Date; data?: Record<string, unknown>;
  }, scope: 'thesis' | 'symbol') => {
    const arr = out.get(e.symbol) ?? [];
    arr.push({
      symbol: e.symbol,
      type: e.type,
      severity: e.severity,
      title: e.title,
      detail: e.detail,
      createdAt: new Date(e.createdAt),
      data: e.data ?? {},
      scope,
    });
    out.set(e.symbol, arr);
  };

  for (const e of thesis) push(e as never, 'thesis');
  for (const e of symbol) push(e as never, 'symbol');

  for (const [sym, arr] of out) {
    arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (opts.perSymbolCap) out.set(sym, arr.slice(0, opts.perSymbolCap));
  }
  return out;
}
