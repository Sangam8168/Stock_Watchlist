import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * One entry in the decision trail: a change a user made to their own thesis.
 *
 * Deliberately separate from ChangeEvent. Those record what the *market* did;
 * this records what the *user* decided, which is a different question and has a
 * different lifetime — a market event stops mattering in weeks, but "when did I
 * move my stop" is exactly the thing you want a year later.
 */
export interface ThesisRevision extends Document {
  userId: string;
  symbol: string;
  changes: { field: string; from: string | number | null; to: string | number | null }[];
  /** Flagged when an invalidation was moved away from price. */
  loosened: boolean;
  createdAt: Date;
}

const ThesisRevisionSchema = new Schema<ThesisRevision>({
  userId: { type: String, required: true },
  symbol: { type: String, required: true, uppercase: true, trim: true },
  changes: [
    {
      _id: false,
      field: { type: String, required: true },
      from: { type: Schema.Types.Mixed, default: null },
      to: { type: Schema.Types.Mixed, default: null },
    },
  ],
  loosened: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

ThesisRevisionSchema.index({ userId: 1, symbol: 1, createdAt: -1 });
// Longer than change events (120d): this is user-authored intent, and its whole
// value is being able to look back further than the market noise around it.
ThesisRevisionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });

export const ThesisRevisionModel: Model<ThesisRevision> =
  (models?.ThesisRevision as Model<ThesisRevision>) ||
  model<ThesisRevision>('ThesisRevision', ThesisRevisionSchema);
