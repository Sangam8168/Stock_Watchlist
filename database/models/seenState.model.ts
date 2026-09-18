import { Schema, model, models, type Document, type Model } from 'mongoose';

// Tracks "how far the user has caught up", per device. Persisting this server-side
// (keyed to the user) is what makes the experience work across sessions and
// devices: your phone and your laptop each remember where they left off, and
// opening one doesn't silently clear the "new" badges on the other.
//
// `symbol` is the ticker, or one of two sentinels.
//
// These are deliberately two different things, and conflating them was a bug:
//   __global — how far you have *reviewed*. Only an explicit "reviewed" or an
//              event actually appearing on your screen moves it. Nothing you
//              have not looked at is ever allowed to disappear.
//   __visit  — when you were last *here*. Stamped on arrival, reviewed or not.
//              Only ever used for the "you last checked …" wording, never to
//              decide what counts as new.
export const GLOBAL_SEEN_KEY = '__global';
export const GLOBAL_VISIT_KEY = '__visit';

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
// Watermarks are per-device, and devices are disposable — a private-mode tab or
// a cleared browser mints one that is never seen again. Without expiry this
// collection grows forever with rows nothing will ever read. Six months is well
// past any real "I last checked" window.
SeenStateSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const SeenStateModel: Model<SeenState> =
  (models?.SeenState as Model<SeenState>) || model<SeenState>('SeenState', SeenStateSchema);
