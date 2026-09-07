'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getChangeHistory } from '@/lib/actions/watchlist.actions';
import { severityTier, TIER_META, CHANGE_TYPE_LABEL, timeAgo, whenExactly } from '@/lib/changes/display';

const RANGES = [
  { days: 1, label: '24 hours' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/**
 * The full chronological record. "While you were away" answers *what's new since
 * I last looked*; this answers *what has this list actually been doing* — it
 * keeps showing events after you've reviewed them.
 */
export default function ChangeHistory({ reloadKey = 0 }: { reloadKey?: number }) {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<ChangeHistoryEntry[] | null>(null);

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // Keep the existing timeline on screen while refetching — blanking it made
    // the list flash "Loading…" on every 45s realtime tick.
    setBusy(true);
    try {
      setRows(await getChangeHistory(days));
    } finally {
      setBusy(false);
    }
    // reloadKey is a refresh signal from the parent, not a query input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, reloadKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Group by calendar day for a readable timeline.
  const byDay = new Map<string, ChangeHistoryEntry[]>();
  for (const r of rows ?? []) {
    const key = new Date(r.createdAt).toDateString();
    const arr = byDay.get(key) ?? [];
    arr.push(r);
    byDay.set(key, arr);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Change history</h2>
          <p className="text-xs text-gray-600">
            Everything the engine recorded, reviewed or not — {rows?.length ?? 0} event{rows?.length === 1 ? '' : 's'}
            {busy && <span className="ml-1 text-gray-700">· refreshing…</span>}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-md border border-gray-600">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 text-xs transition-colors ${
                days === r.days ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-500">
          Nothing recorded in this window. Hit “Refresh” or wait for the 15-minute poll.
        </p>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, events]) => (
            <div key={day}>
              <div className="mb-2 flex items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {new Date(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
                </h3>
                <span className="h-px flex-1 bg-gray-800" />
                <span className="text-xs text-gray-700">{events.length}</span>
              </div>

              <ol className="relative space-y-3 border-l border-gray-800 pl-5">
                {events.map((e, i) => {
                  const meta = TIER_META[severityTier(e.severity)];
                  return (
                    <li key={i} className="relative">
                      <span className={`absolute -left-[23px] top-1.5 h-2 w-2 rounded-full ${meta.dot}`} />
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link href={`/stocks/${e.symbol}`} className="text-sm font-semibold text-gray-100 hover:text-yellow-500">
                          {e.symbol}
                        </Link>
                        <span className="text-xs text-gray-600">{CHANGE_TYPE_LABEL[e.type] ?? e.type}</span>
                        {e.scope === 'thesis' && (
                          <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-600">your thesis</span>
                        )}
                        <span className="ml-auto text-xs text-gray-600" title={whenExactly(e.createdAt)}>
                          {timeAgo(e.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-400">{e.detail}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
