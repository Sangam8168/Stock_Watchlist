// Per-user rate limiting for server actions.
//
// In-memory counters don't work here: serverless runs many isolated instances,
// so a per-process map lets a user multiply their quota by however many
// instances they reach. State has to be shared, and Mongo is already the shared
// store — a TTL-expired counter document per (user, action, window) keeps it to
// one atomic upsert with no extra infrastructure.

import { Schema, model, models, type Model, type Document } from 'mongoose';
import { connectToDatabase } from '@/database/mongoose';
import { log } from '@/lib/observability/logger';

interface RateCounter extends Document {
  key: string;
  count: number;
  expiresAt: Date;
}

const RateCounterSchema = new Schema<RateCounter>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
// Mongo reclaims the document once the window closes — no cleanup job.
RateCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateCounterModel: Model<RateCounter> =
  (models?.RateCounter as Model<RateCounter>) || model<RateCounter>('RateCounter', RateCounterSchema);

export interface RateLimit {
  /** Max calls allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/** Tuned to the cost of each action, not a single global number. */
export const LIMITS = {
  // Hits the data provider — the most expensive thing a user can trigger.
  refresh: { limit: 10, windowSeconds: 60 },
  // Sends mail; Gmail has its own daily cap we must stay well under.
  email: { limit: 5, windowSeconds: 300 },
  // Provider search calls.
  search: { limit: 60, windowSeconds: 60 },
  // Cheap DB writes, but still worth bounding against scripted abuse.
  write: { limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimit>;

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Atomically count one call against (subject, action) for the current window.
 *
 * Fails **open**: if the datastore is unreachable the user is let through and we
 * log it. A rate limiter that hard-fails takes the whole app down with it, which
 * is a worse outcome than briefly unmetered traffic.
 */
export async function rateLimit(
  subject: string,
  action: keyof typeof LIMITS
): Promise<RateResult> {
  const { limit, windowSeconds } = LIMITS[action];
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `${action}:${subject}:${bucket}`;
  const expiresAt = new Date((bucket + 1) * windowSeconds * 1000);

  try {
    await connectToDatabase();
    const doc = await RateCounterModel.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { key, expiresAt } },
      { upsert: true, new: true, projection: { count: 1 } }
    ).lean();

    const count = doc?.count ?? 1;
    const allowed = count <= limit;
    if (!allowed) log.warn('rate_limit.exceeded', { action, subject, count, limit });

    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
    };
  } catch (err) {
    log.error('rate_limit.unavailable', err, { action });
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

/** Human-readable refusal, safe to show in a toast. */
export function rateLimitMessage(r: RateResult): string {
  return `You're doing that too fast — try again in ${r.retryAfterSeconds}s.`;
}
