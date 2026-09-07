import { Schema, model, models, type Document, type Model } from 'mongoose';

// A watchlist item is a *thesis*, not just a ticker. "Meaningful change" is
// always evaluated relative to these fields — the entry band you care about,
// the level that would prove you wrong, the event you're waiting on.
export const WATCHLIST_CATEGORIES = [
  'active',       // near-term actionable entry — review daily
  'developing',   // setup forming, not yet actionable — review weekly
  'longterm',     // want to own on the right pullback — review monthly
  'earnings',     // holding for / around an upcoming report
  'speculative',  // high risk, size small if taken
] as const;

export type WatchlistCategory = (typeof WATCHLIST_CATEGORIES)[number];

export interface WatchlistItem extends Document {
  userId: string;
  symbol: string;
  company: string;
  category: WatchlistCategory;
  thesis?: string;
  direction: 'long' | 'short';
  entryLow?: number;
  entryHigh?: number;
  invalidationPrice?: number;
  targetPrice?: number;
  catalystDate?: Date;
  catalystNote?: string;
  notify: boolean;
  /** Alerts + digest suppressed for this item until this time (snooze). */
  mutedUntil?: Date;
  /**
   * You bought it. A watchlist is candidates; a portfolio is positions — they
   * deserve different attention, so owned items move out of the main list but
   * keep their thesis, levels and change history.
   */
  owned: boolean;
  ownedAt?: Date;
  ownedPrice?: number;
  /** Last time you deliberately reviewed this thesis (Monthly-review discipline). */
  lastReviewedAt?: Date;
  addedAt: Date;
  updatedAt: Date;
}

const WatchlistSchema = new Schema<WatchlistItem>(
  {
    userId: { type: String, required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    company: { type: String, required: true, trim: true },
    category: { type: String, enum: WATCHLIST_CATEGORIES, default: 'developing' },
    thesis: { type: String, trim: true, maxlength: 400 },
    direction: { type: String, enum: ['long', 'short'], default: 'long' },
    entryLow: { type: Number, min: 0 },
    entryHigh: { type: Number, min: 0 },
    invalidationPrice: { type: Number, min: 0 },
    targetPrice: { type: Number, min: 0 },
    catalystDate: { type: Date },
    catalystNote: { type: String, trim: true, maxlength: 200 },
    notify: { type: Boolean, default: true },
    mutedUntil: { type: Date },
    owned: { type: Boolean, default: false },
    ownedAt: { type: Date },
    ownedPrice: { type: Number, min: 0 },
    lastReviewedAt: { type: Date },
    addedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// One row per (user, symbol).
WatchlistSchema.index({ userId: 1, symbol: 1 }, { unique: true });
// Reverse lookup: "who watches this symbol" (detection fan-out, digest dispatch).
WatchlistSchema.index({ symbol: 1, notify: 1 });

export const Watchlist: Model<WatchlistItem> =
  (models?.Watchlist as Model<WatchlistItem>) || model<WatchlistItem>('Watchlist', WatchlistSchema);
