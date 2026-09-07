'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDeviceId } from '@/hooks/useDeviceId';
import { getWatchlistEntry, markSeen } from '@/lib/actions/watchlist.actions';
import WatchlistButton from '@/components/WatchlistButton';
import ThesisDialog from '@/components/watchlist/ThesisDialog';
import ThesisMeter from '@/components/watchlist/ThesisMeter';
import {
  fmtPrice,
  severityTier,
  TIER_META,
  CHANGE_TYPE_LABEL,
  timeAgo,
} from '@/lib/changes/display';

export default function SymbolThesisPanel({ symbol, company }: { symbol: string; company: string }) {
  const deviceId = useDeviceId();
  const [entry, setEntry] = useState<WatchlistEntry | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setEntry(await getWatchlistEntry(symbol, deviceId));
  }, [deviceId, symbol]);

  useEffect(() => {
    load();
  }, [load]);

  if (entry === undefined) {
    return <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm text-gray-500">Loading…</div>;
  }

  if (entry === null) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <p className="text-sm text-gray-400">
          Not on your watchlist. Add it with a thesis so you get told what &ldquo;meaningfully changed&rdquo;.
        </p>
        <div className="mt-3">
          <WatchlistButton symbol={symbol} company={company} isInWatchlist={false} />
        </div>
      </div>
    );
  }

  const levels: Array<{ label: string; value: number | null }> = [
    { label: 'Entry low', value: entry.entryLow },
    { label: 'Entry high', value: entry.entryHigh },
    { label: 'Invalidation', value: entry.invalidationPrice },
    { label: 'Target', value: entry.targetPrice },
  ];

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Your thesis</h3>
          <p className="mt-1 text-gray-200">{entry.thesis || <span className="italic text-gray-500">None set</span>}</p>
        </div>
        <ThesisDialog
          symbol={symbol}
          company={company}
          mode="edit"
          initial={entry}
          onDone={load}
          trigger={<button className="text-xs text-gray-500 hover:text-yellow-500">Edit</button>}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {levels.map((l) => (
          <div key={l.label} className="rounded bg-gray-900/60 p-2">
            <div className="text-[11px] text-gray-500">{l.label}</div>
            <div className="text-sm text-gray-200">{fmtPrice(l.value)}</div>
          </div>
        ))}
      </div>

      <ThesisMeter entry={entry} />

      {entry.price != null && (
        <p className="text-xs text-gray-500">
          Now {fmtPrice(entry.price)}
          {entry.distanceToEntryPct != null &&
            (entry.distanceToEntryPct === 0
              ? ' · in entry zone'
              : ` · ${Math.abs(entry.distanceToEntryPct).toFixed(1)}% ${entry.distanceToEntryPct > 0 ? 'above' : 'below'} entry`)}
          {entry.stale && ' · data delayed'}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">What changed</h3>
          {entry.unseenCount > 0 && (
            <button
              onClick={() => deviceId && markSeen(deviceId, [symbol]).then(load)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              mark reviewed
            </button>
          )}
        </div>
        {entry.events.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">No changes recorded yet. A baseline snapshot has been taken.</p>
        ) : (
          <ul className="mt-2 space-y-2 border-l border-gray-700 pl-3">
            {entry.events.map((e, i) => {
              const meta = TIER_META[severityTier(e.severity)];
              return (
                <li key={i} className="text-sm">
                  <span className="text-[11px] text-gray-500">
                    <span className={meta.text}>●</span> {CHANGE_TYPE_LABEL[e.type] ?? e.type} · {timeAgo(e.createdAt)}
                  </span>
                  <p className="text-gray-300">{e.detail}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
