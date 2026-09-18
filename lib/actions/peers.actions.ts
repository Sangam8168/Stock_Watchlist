'use server';

// Peer comparison for a single symbol.
//
// A P/E of 38 means nothing on its own — it is only high or low relative to the
// companies it competes with. This pulls the provider's peer list and the same
// handful of metrics for each, so a thesis can be checked against its industry
// rather than against a number the user half-remembers.

import { fetchJSON } from '@/lib/actions/finnhub.actions';
import { rateLimit } from '@/lib/observability/rate-limit';
import { log } from '@/lib/observability/logger';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { exchangeOf } from '@/lib/changes/exchange';

const B = 'https://finnhub.io/api/v1';

/** Small enough to stay well inside the provider's per-minute budget. */
const MAX_PEERS = 5;

export interface Peer {
  symbol: string;
  peRatio: number | null;
  return1Y: number | null;
  revenueGrowth: number | null;
  marketCap: number | null;
  isSelf: boolean;
}

export async function getPeers(symbol: string): Promise<{ ok: boolean; peers?: Peer[]; reason?: string }> {
  // The UI hides this for non-US listings; re-check here so a direct action
  // call cannot spend quota on a request the provider will refuse anyway.
  if (exchangeOf(symbol).id !== 'US') {
    return { ok: false, reason: 'Peer data is only available for US listings' };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, reason: 'Please sign in again.' };

  const token = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!token) return { ok: false, reason: 'Market data isn’t configured.' };

  // One call for the list plus one per peer — worth metering.
  const rl = await rateLimit(session.user.id, 'search');
  if (!rl.allowed) return { ok: false, reason: 'Too many requests — try again shortly.' };

  const sym = symbol.trim().toUpperCase();
  try {
    const list = await fetchJSON<string[]>(`${B}/stock/peers?symbol=${sym}&token=${token}`, 86400);
    if (!Array.isArray(list) || !list.length) return { ok: false, reason: 'No peers listed for this symbol.' };

    // The provider includes the symbol itself; keep it so the row can be
    // highlighted for comparison rather than dropped.
    const symbols = [sym, ...list.filter((p) => p && p !== sym)].slice(0, MAX_PEERS + 1);

    const peers = await Promise.all(
      symbols.map(async (p): Promise<Peer> => {
        try {
          // Cached for a day: fundamentals don't move intraday, and this keeps
          // a peer lookup from competing with the poll for quota.
          const m = await fetchJSON<{ metric?: Record<string, number | null> }>(
            `${B}/stock/metric?symbol=${p}&metric=all&token=${token}`,
            86400
          );
          const M = m?.metric ?? {};
          const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
          return {
            symbol: p,
            peRatio: n(M.peTTM) ?? n(M.peBasicExclExtraTTM),
            return1Y: n(M['52WeekPriceReturnDaily']),
            revenueGrowth: n(M.revenueGrowthTTMYoy),
            marketCap: n(M.marketCapitalization) != null ? (M.marketCapitalization as number) * 1e6 : null,
            isSelf: p === sym,
          };
        } catch {
          return { symbol: p, peRatio: null, return1Y: null, revenueGrowth: null, marketCap: null, isSelf: p === sym };
        }
      })
    );

    return { ok: true, peers };
  } catch (err) {
    log.error('peers.failed', err, { symbol: sym });
    return { ok: false, reason: 'Could not load peers right now.' };
  }
}
