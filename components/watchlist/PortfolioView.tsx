'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Briefcase } from 'lucide-react';
import { useDeviceId } from '@/hooks/useDeviceId';
import { getWatchlist, returnToWatchlist } from '@/lib/actions/watchlist.actions';
import { fmtPct } from '@/lib/changes/display';
import WatchlistRow from '@/components/watchlist/WatchlistRow';

/**
 * Positions you actually own. Separated from the watchlist because owning
 * changes the question from "should I buy?" to "does the thesis still hold?".
 */
export default function PortfolioView() {
  const deviceId = useDeviceId();
  const [entries, setEntries] = useState<WatchlistEntry[] | null>(null);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setEntries(await getWatchlist(deviceId));
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!deviceId || entries === null) {
    return <p className="py-16 text-center text-gray-500">Loading…</p>;
  }

  const positions = entries.filter((e) => e.owned);

  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center">
        <Briefcase className="mx-auto h-6 w-6 text-gray-600" />
        <p className="mt-3 text-gray-300">Nothing here yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
          When you buy something on your watchlist, move it here — it keeps its thesis and
          change history, but stops competing for attention with things you&rsquo;re still deciding on.
        </p>
        <p className="mt-3 text-xs text-gray-700">
          Watchlist → Table view → select a row → <span className="text-gray-500">Move to portfolio</span>
        </p>
      </div>
    );
  }

  const withReturn = positions.filter((p) => p.ownedReturnPct != null);
  const avgReturn = withReturn.length
    ? withReturn.reduce((s, p) => s + (p.ownedReturnPct as number), 0) / withReturn.length
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-700 bg-gray-700 sm:grid-cols-3">
        <Stat label="Positions" value={String(positions.length)} />
        <Stat
          label="Average return"
          value={avgReturn == null ? '—' : fmtPct(avgReturn)}
          tone={avgReturn == null ? undefined : avgReturn >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="Need attention"
          value={String(positions.filter((p) => p.topUnseenSeverity >= 50).length)}
        />
      </div>

      <div className="space-y-3">
        {positions.map((entry) => (
          <div key={entry.symbol}>
            <WatchlistRow entry={entry} deviceId={deviceId} onChange={load} />
            <div className="mt-1 flex justify-end">
              <button
                onClick={async () => {
                  await returnToWatchlist(entry.symbol);
                  toast.success(`${entry.symbol} back on the watchlist`);
                  await load();
                }}
                className="rounded border border-gray-800 px-2 py-0.5 text-[11px] text-gray-600 transition-colors hover:border-gray-600 hover:text-gray-300"
              >
                Sold — back to watchlist
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  const color = tone === 'up' ? 'text-green-500' : tone === 'down' ? 'text-red-500' : 'text-gray-100';
  return (
    <div className="bg-gray-800 p-4">
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
