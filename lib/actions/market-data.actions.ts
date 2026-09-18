'use server';

// The only client-facing piece of market data: a single current quote, used by
// the thesis editor so levels are set against a real price rather than typed
// blind. Snapshot assembly lives in lib/market-data/snapshot.ts and is not
// exported as an action — see the note at the top of that file.

import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth/auth';
import { rateLimit } from '@/lib/observability/rate-limit';
import { getQuote as readQuote } from '@/lib/market-data/snapshot';

export async function getQuote(
  symbol: string
): Promise<{ price?: number; changePercent?: number; asOf: Date; stale: boolean }> {
  const now = new Date();

  // This reaches a third-party provider, so it is metered like a search. An
  // unauthenticated caller gets nothing rather than a free quota drain.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { asOf: now, stale: true };

  const rl = await rateLimit(session.user.id, 'search');
  if (!rl.allowed) return { asOf: now, stale: true };

  return readQuote(symbol);
}
