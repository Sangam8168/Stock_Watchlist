import { Schema, model, models, type Document, type Model } from 'mongoose';

// The materialized "what changed" feed. Produced once per poll by the detection
// engine (never recomputed on page load) and consumed by the "While you were
// away" digest. Each event is scored so the UI can rank attention.
export const CHANGE_TYPES = [
  'entered_entry_zone',
  'invalidation_breached',
  'target_reached',
  'abnormal_move',
  'catalyst_imminent',
  'earnings_reported',
  'news_break',
  'new_52w_high',
  'new_52w_low',
  'valuation_shift',
  'corporate_action',
  'stale_data',
  'thesis_stale',
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

export interface ChangeEvent extends Document {
  userId: string;
  symbol: string;
  type: ChangeType;
  severity: number;        // 0–100, higher = more deserving of attention
  title: string;           // short label
  detail: string;          // plain-English "what happened and why it matters"
  data: Record<string, unknown>;
  dedupeKey: string;       // stops the same change from being logged every poll
  fromSnapshotId?: string;
  toSnapshotId?: string;
  createdAt: Date;
}

const ChangeEventSchema = new Schema<ChangeEvent>(
  {
    userId: { type: String, required: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: CHANGE_TYPES, required: true },
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

ChangeEventSchema.index({ userId: 1, symbol: 1, createdAt: -1 });
ChangeEventSchema.index({ userId: 1, createdAt: -1 });
// Idempotent detection: a given change is recorded once.
ChangeEventSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
// Keep the feed bounded.
ChangeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 120 });

export const ChangeEventModel: Model<ChangeEvent> =
  (models?.ChangeEvent as Model<ChangeEvent>) || model<ChangeEvent>('ChangeEvent', ChangeEventSchema);
