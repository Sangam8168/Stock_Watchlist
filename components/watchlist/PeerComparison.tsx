'use client';

import { useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPeers, type Peer } from '@/lib/actions/peers.actions';
import { fmtMarketCap, fmtPct } from '@/lib/changes/display';
import { exchangeOf } from '@/lib/changes/exchange';

/**
 * How this company compares to the ones it competes with.
 *
 * A P/E of 38 is neither high nor low until you know the industry sits at 22 —
 * so the useful view is relative, and the row for the symbol you're looking at
 * is highlighted rather than removed.
 *
 * Loaded on demand: it costs one provider call per peer, and most visits to a
 * stock page don't need it.
 */
export default function PeerComparison({ symbol }: { symbol: string }) {
  const [peers, setPeers] = useState<Peer[] | null>(null);
  const [loading, setLoading] = useState(false);

  // The peer list comes from the US provider, which has no data for NSE or BSE
  // listings. Offering a button that can only fail is worse than not offering it.
  if (exchangeOf(symbol).id !== 'US') return null;

  const load = async () => {
    setLoading(true);
    try {
      const res = await getPeers(symbol);
      if (res.ok && res.peers) setPeers(res.peers);
      else toast.error(res.reason || 'Could not load peers');
    } finally {
      setLoading(false);
    }
  };

  if (!peers) {
    return (
      <button
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-white/25 hover:text-gray-200 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
        {loading ? 'Loading…' : 'Compare to peers'}
      </button>
    );
  }

  // Median is the fair reference — one loss-making peer with a 900 P/E would
  // drag a mean far enough to make everything else look cheap.
  const med = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  };
  const medPe = med(peers.map((p) => p.peRatio));
  const self = peers.find((p) => p.isSelf);

  return (
    <div className="surface-sunken">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Users className="h-3.5 w-3.5" /> Peers
        </p>
        {self?.peRatio != null && medPe != null && (
          <span className="text-[11px] text-gray-500">
            P/E {self.peRatio.toFixed(1)} vs median{' '}
            <span className={self.peRatio > medPe ? 'text-amber-400' : 'text-green-500'}>{medPe.toFixed(1)}</span>
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="border-b hairline text-gray-600">
              <th className="py-1.5 text-left font-medium">Symbol</th>
              <th className="py-1.5 text-right font-medium">P/E</th>
              <th className="py-1.5 text-right font-medium">1Y</th>
              <th className="py-1.5 text-right font-medium">Rev growth</th>
              <th className="py-1.5 text-right font-medium">Mkt cap</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => (
              <tr key={p.symbol} className={`border-b hairline last:border-0 ${p.isSelf ? 'bg-yellow-500/5' : ''}`}>
                <td className={`py-1.5 ${p.isSelf ? 'font-semibold text-yellow-500' : 'text-gray-300'}`}>{p.symbol}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-400">{p.peRatio != null ? p.peRatio.toFixed(1) : '—'}</td>
                <td className={`py-1.5 text-right tabular-nums ${p.return1Y == null ? 'text-gray-600' : p.return1Y >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {p.return1Y != null ? fmtPct(p.return1Y) : '—'}
                </td>
                <td className={`py-1.5 text-right tabular-nums ${p.revenueGrowth == null ? 'text-gray-600' : p.revenueGrowth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {p.revenueGrowth != null ? fmtPct(p.revenueGrowth) : '—'}
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-400">{fmtMarketCap(p.marketCap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
