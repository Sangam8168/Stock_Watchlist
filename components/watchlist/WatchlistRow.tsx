'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Pencil, Trash2, AlertTriangle, Clock, BellOff, Bell } from 'lucide-react';
import ThesisDialog from '@/components/watchlist/ThesisDialog';
import ThesisMeter from '@/components/watchlist/ThesisMeter';
import Sparkline from '@/components/watchlist/Sparkline';
import { removeFromWatchlist, markSeen, snoozeWatchlistItem } from '@/lib/actions/watchlist.actions';
import { fmtPrice, fmtPct, fmtMarketCap, severityTier, TIER_META, timeAgo } from '@/lib/changes/display';

const SNOOZE_OPTIONS: { label: string; days: number }[] = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

export default function WatchlistRow({
  entry,
  deviceId,
  onChange,
}: {
  entry: WatchlistEntry;
  deviceId: string;
  onChange: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const act = (fn: () => Promise<unknown>, msg?: string) =>
    startTransition(async () => {
      await fn();
      if (msg) toast.success(msg);
      onChange();
    });

  const changeColor =
    entry.changePercent == null ? 'text-gray-400' : entry.changePercent >= 0 ? 'text-green-500' : 'text-red-500';

  const dist = entry.distanceToEntryPct;
  const entryLabel =
    entry.entryLow == null || entry.entryHigh == null
      ? null
      : dist === 0
        ? 'in entry zone'
        : dist == null
          ? null
          : `${Math.abs(dist).toFixed(1)}% ${dist > 0 ? 'above' : 'below'} entry`;

  const tier = entry.topUnseenSeverity ? severityTier(entry.topUnseenSeverity) : null;
  const muted = entry.mutedUntil != null;

  return (
    <div className={`rounded-lg border bg-gray-800 p-4 ${muted ? 'border-gray-800 opacity-70' : 'border-gray-700'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {entry.unseenCount > 0 && tier && !muted && (
              <span
                className={`h-2 w-2 rounded-full ${TIER_META[tier].dot}`}
                title={`${entry.unseenCount} unreviewed update${entry.unseenCount === 1 ? '' : 's'}`}
              />
            )}
            <Link href={`/stocks/${entry.symbol}`} className="font-semibold text-gray-100 hover:text-yellow-500">
              {entry.symbol}
            </Link>
            {entry.direction === 'short' && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">short</span>
            )}
            {muted && (
              <span
                className="inline-flex items-center gap-1 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400"
                title={`Muted until ${new Date(entry.mutedUntil!).toLocaleDateString()}`}
              >
                <BellOff className="h-3 w-3" /> muted until {new Date(entry.mutedUntil!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            <span className="truncate text-sm text-gray-500">{entry.company}</span>
          </div>

          {entry.thesis ? (
            <p className="mt-1 text-sm text-gray-400">{entry.thesis}</p>
          ) : (
            <p className="mt-1 text-sm italic text-gray-600">No thesis yet — add one to sharpen change detection</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {entryLabel && <span className={dist === 0 ? 'text-yellow-500' : ''}>{entryLabel}</span>}
            {entry.invalidationPrice != null && <span>invalidation {fmtPrice(entry.invalidationPrice)}</span>}
            {entry.targetPrice != null && <span>target {fmtPrice(entry.targetPrice)}</span>}
            {entry.catalystTradingDays != null && entry.catalystTradingDays <= 15 && (
              <span className={entry.catalystTradingDays <= 5 ? 'text-amber-400' : ''}>
                {entry.catalystNote || 'catalyst'} in {entry.catalystTradingDays}d
              </span>
            )}
            {entry.peRatio != null && <span>P/E {entry.peRatio.toFixed(1)}</span>}
            {entry.marketCap != null && <span>{fmtMarketCap(entry.marketCap)}</span>}
          </div>

          <ThesisMeter entry={entry} />

          {(entry.stale || entry.unconfirmedFields.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {entry.stale && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
                  <Clock className="h-3 w-3" />
                  {entry.dataAsOf ? `delayed · as of ${timeAgo(entry.dataAsOf)}` : 'no fresh data yet'}
                </span>
              )}
              {entry.unconfirmedFields.map((f) => (
                <span key={f} className="inline-flex items-center gap-1 rounded bg-gray-700 px-1.5 py-0.5 text-gray-400">
                  <AlertTriangle className="h-3 w-3" /> {f} unconfirmed
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="text-base font-semibold text-gray-100">{fmtPrice(entry.price)}</div>
          <div className={`text-sm ${changeColor}`}>{fmtPct(entry.changePercent)}</div>
          <Sparkline data={entry.priceHistory} />
        </div>
      </div>

      {entry.unseenCount > 0 && !muted && (
        <div className="mt-3 rounded-md bg-gray-900/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">
              {entry.unseenCount} update{entry.unseenCount === 1 ? '' : 's'} since you last reviewed
            </span>
            <button onClick={() => act(() => markSeen(deviceId, [entry.symbol]))} disabled={pending} className="text-xs text-gray-500 hover:text-gray-300">
              mark reviewed
            </button>
          </div>
          <ul className="mt-1.5 space-y-1">
            {entry.events
              .filter((e) => new Date(e.createdAt).getTime() > Date.now() - 1000 * 60 * 60 * 24 * 30)
              .slice(0, 3)
              .map((e, i) => (
                <li key={i} className="text-sm text-gray-400">
                  <span className={`mr-1.5 ${TIER_META[severityTier(e.severity)].text}`}>•</span>
                  {e.detail} <span className="text-xs text-gray-600">· {timeAgo(e.createdAt)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <ThesisDialog
          symbol={entry.symbol}
          company={entry.company}
          mode="edit"
          initial={entry}
          onDone={onChange}
          trigger={
            <button className="inline-flex items-center gap-1 text-gray-500 hover:text-yellow-500">
              <Pencil className="h-3.5 w-3.5" /> Edit thesis
            </button>
          }
        />

        <div className="relative">
          {muted ? (
            <button
              onClick={() => act(() => snoozeWatchlistItem(entry.symbol, null), `${entry.symbol} unmuted`)}
              disabled={pending}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-yellow-500"
            >
              <Bell className="h-3.5 w-3.5" /> Unmute
            </button>
          ) : (
            <button
              onClick={() => setSnoozeOpen((v) => !v)}
              disabled={pending}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-yellow-500"
            >
              <BellOff className="h-3.5 w-3.5" /> Snooze
            </button>
          )}
          {snoozeOpen && !muted && (
            <div className="absolute left-0 top-6 z-10 rounded-md border border-gray-600 bg-gray-800 p-1 shadow-xl">
              {SNOOZE_OPTIONS.map((o) => (
                <button
                  key={o.days}
                  onClick={() => {
                    setSnoozeOpen(false);
                    act(() => snoozeWatchlistItem(entry.symbol, o.days), `${entry.symbol} muted for ${o.label}`);
                  }}
                  className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-gray-300 hover:bg-gray-700"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => act(() => removeFromWatchlist(entry.symbol), `${entry.symbol} removed`)}
          disabled={pending}
          className="inline-flex items-center gap-1 text-gray-500 hover:text-red-400 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
    </div>
  );
}
