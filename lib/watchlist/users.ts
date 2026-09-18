// Server-only lookups used by the scheduled jobs.
//
// `symbolsForEmail` used to live in a 'use server' module, which published it as
// a server action — so any browser could pass an arbitrary email address and get
// back that person's watchlist. Nothing about it was ever meant to be reachable
// from a client; the only caller is the daily-news job, which runs server-side.
// Keeping it out of an action module is the whole fix.

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { log } from '@/lib/observability/logger';

/** Symbols on a user's watchlist, looked up by their email address. */
export async function symbolsForEmail(email: string): Promise<string[]> {
  if (!email) return [];
  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');

    const user = await db
      .collection('user')
      .findOne<{ _id?: unknown; id?: string }>({ email });
    if (!user) return [];

    const userId = (user.id as string) || String(user._id || '');
    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
    return items.map((i) => String(i.symbol));
  } catch (err) {
    log.error('digest.symbols_for_email.failed', err);
    return [];
  }
}
