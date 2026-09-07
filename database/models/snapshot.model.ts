import { Schema, model, models, type Document, type Model } from 'mongoose';

// An append-only, per-symbol time series. Ingestion (Inngest cron) writes these;
// every read path (dashboard, watchlist, change detection) reads from here and
// never calls the market-data provider directly. That decoupling is what lets
// the system scale: 10,000 users watching AAPL cost exactly one fetch.
export interface StockSnapshot extends Document {
  symbol: string;
  capturedAt: Date;        // when we wrote this row
  asOf: Date;              // provider's timestamp for the quote (may lag capturedAt)
  stale: boolean;          // asOf is old relative to market state, or fetch degraded
  source: string;          // 'finnhub' | 'finnhub:partial' | ...

  price?: number;
  changePercent?: number;  // provider daily % change
  dayHigh?: number;
  dayLow?: number;
  prevClose?: number;

  week52High?: number;
  week52Low?: number;
  peRatio?: number;
  marketCap?: number;      // in USD

  nextEarningsDate?: Date;

  newsHash?: string;       // hash of the latest headline set for this symbol
  newsCount?: number;      // # of articles in the trailing window
  topHeadline?: string;

  // Fields whose sources disagreed beyond tolerance at capture time.
  unconfirmedFields?: string[];
}

const SnapshotSchema = new Schema<StockSnapshot>(
  {
    symbol: { type: String, required: true, uppercase: true, trim: true },
    capturedAt: { type: Date, required: true, default: Date.now },
    asOf: { type: Date, required: true, default: Date.now },
    stale: { type: Boolean, default: false },
    source: { type: String, default: 'finnhub' },

    price: Number,
    changePercent: Number,
    dayHigh: Number,
    dayLow: Number,
    prevClose: Number,

    week52High: Number,
    week52Low: Number,
    peRatio: Number,
    marketCap: Number,

    nextEarningsDate: Date,

    newsHash: String,
    newsCount: Number,
    topHeadline: String,

    unconfirmedFields: { type: [String], default: undefined },
  },
  { timestamps: false }
);

// Newest-first lookups per symbol are the hot path.
SnapshotSchema.index({ symbol: 1, capturedAt: -1 });
// Bounded retention: rows self-delete after 90 days so storage stays flat.
SnapshotSchema.index({ capturedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Snapshot: Model<StockSnapshot> =
  (models?.Snapshot as Model<StockSnapshot>) || model<StockSnapshot>('Snapshot', SnapshotSchema);
