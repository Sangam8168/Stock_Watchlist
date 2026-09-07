import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * A refcounted index of every symbol that at least one user watches, plus a
 * cached copy of its latest snapshot. Lets the ingestion cron enumerate work in
 * O(distinct symbols) instead of scanning the whole watchlist collection, and
 * lets read paths get "latest price for symbol X" in one indexed lookup instead
 * of sorting the snapshot time-series.
 *
 * `watchers` is maintained by add/remove; a symbol with `watchers <= 0` is
 * skipped by the poll and eventually pruned.
 */
export interface WatchedSymbol extends Document {
  symbol: string;
  watchers: number;
  tier: 'active' | 'normal'; // 'active' = someone has it in an "active" category → poll every cycle
  latest?: Record<string, unknown>; // last snapshot (plain object)
  lastPolledAt?: Date;
  updatedAt: Date;
}

const WatchedSymbolSchema = new Schema<WatchedSymbol>(
  {
    symbol: { type: String, required: true, uppercase: true, trim: true, unique: true },
    watchers: { type: Number, default: 0 },
    tier: { type: String, enum: ['active', 'normal'], default: 'normal' },
    latest: { type: Schema.Types.Mixed },
    lastPolledAt: { type: Date },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

WatchedSymbolSchema.index({ watchers: 1 });
WatchedSymbolSchema.index({ tier: 1, lastPolledAt: 1 });

export const WatchedSymbolModel: Model<WatchedSymbol> =
  (models?.WatchedSymbol as Model<WatchedSymbol>) || model<WatchedSymbol>('WatchedSymbol', WatchedSymbolSchema);
