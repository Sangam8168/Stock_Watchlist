import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * A symbol-level change — identical for everyone who watches the ticker
 * (abnormal move, news break, 52-week extreme, earnings, valuation, split,
 * stale data). Stored ONCE per symbol per change instead of once per (user,
 * symbol), which is what keeps detection O(distinct symbols) rather than
 * O(users × watchlist size).
 *
 * Per-user thesis events (entered your entry band, broke your invalidation,
 * hit your target) still live in `ChangeEvent`. Read paths union the two.
 */
export interface SymbolEvent extends Document {
  symbol: string;
  type: string;
  severity: number;
  title: string;
  detail: string;
  data: Record<string, unknown>;
  dedupeKey: string; // unique per symbol
  fromSnapshotId?: string;
  toSnapshotId?: string;
  createdAt: Date;
}

const SymbolEventSchema = new Schema<SymbolEvent>(
  {
    symbol: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, required: true },
    severity: { type: Number, required: true, min: 0, max: 100 },
    title: { type: String, required: true },
    detail: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    dedupeKey: { type: String, required: true },
    fromSnapshotId: String,
    toSnapshotId: String,
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Hot read: "symbol-level events for the symbols I watch, since my watermark".
SymbolEventSchema.index({ symbol: 1, createdAt: -1 });
// Idempotent detection.
SymbolEventSchema.index({ dedupeKey: 1 }, { unique: true });
// Bounded retention.
SymbolEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 120 });

export const SymbolEventModel: Model<SymbolEvent> =
  (models?.SymbolEvent as Model<SymbolEvent>) || model<SymbolEvent>('SymbolEvent', SymbolEventSchema);
