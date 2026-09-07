import { Schema, model, models, type Document, type Model } from 'mongoose';

// Tracks "how far the user has caught up", per device. Persisting this server-side
// (keyed to the user) is what makes the experience work across sessions and
// devices: your phone and your laptop each remember where they left off, and
// opening one doesn't silently clear the "new" badges on the other.
//
// `symbol` is the ticker, or the sentinel '__global' for the last dashboard visit.
export const GLOBAL_SEEN_KEY = '__global';

export interface SeenState extends Document {
  userId: string;
  deviceId: string;
  symbol: string;
  lastSeenAt: Date;
}

const SeenStateSchema = new Schema<SeenState>(
  {
    userId: { type: String, required: true },
    deviceId: { type: String, required: true },
    symbol: { type: String, required: true, trim: true },
    lastSeenAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false }
);

SeenStateSchema.index({ userId: 1, deviceId: 1, symbol: 1 }, { unique: true });

export const SeenStateModel: Model<SeenState> =
  (models?.SeenState as Model<SeenState>) || model<SeenState>('SeenState', SeenStateSchema);
