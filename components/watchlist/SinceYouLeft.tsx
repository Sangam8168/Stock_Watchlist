'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, ChevronDown, BellOff, Trash2, ArrowRight } from 'lucide-react';
import { markSeen, removeFromWatchlist, snoozeWatchlistItem } from '@/lib/actions/watchlist.actions';
import { notifySeenChanged } from '@/components/watchlist/WatchlistNavLink';
import { severityTier, TIER_META, CHANGE_TYPE_LABEL, timeAgo, whenExactly, fmtDelta } from '@/lib/changes/display';

interface Props {
  digest: SinceYouLeftDigest;
  deviceId: string;
  onReviewed: () => void;
  onItemChange?: () => void;
}

export default function SinceYouLeft({ digest, deviceId, onReviewed, onItemChange }: Props) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { counts, groups, lastVisit } = digest;

  const after = onItemChange ?? onReviewed;

  const reviewAll = () =>
    startTransition(async () => {
      await markSeen(deviceId);
      notifySeenChanged();
      onReviewed();
    });

  const reviewSymbol = (symbol: string) =>
    startTransition(async () => {
      await markSeen(deviceId, [symbol]);
      notifySeenChanged();
      onReviewed();
    });

  const cull = (symbol: string) =>
    startTransition(async () => {
      await removeFromWatchlist(symbol);
      toast.success(`${symbol} removed from watchlist`);
      after();
    });

  const snooze = (symbol: string) =>
    startTransition(async () => {
      await snoozeWatchlistItem(symbol, 7);
      await markSeen(deviceId, [symbol]);
      notifySeenChanged();
      toast.success(`${symbol} muted for 1 week`);
      after();
    });

  if (counts.unseenEvents === 0) {
    // "Nothing changed" is the most common state, and on its own it reads like a
    // broken app. Say what's being watched and what would break the silence.
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            All quiet
          </h2>
          <span className="text-xs text-gray-600">
            {lastVisit ? `checked ${timeAgo(lastVisit)}` : 'first visit'}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-gray-500">
          Watching <span className="font-medium text-gray-300">{counts.itemsTracked}</span>{' '}
          {counts.itemsTracked === 1 ? 'thesis' : 'theses'}. Nothing has crossed a level you set.
        </p>

        <div className="mt-3 border-t border-gray-700/70 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            You&rsquo;ll hear from us when
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-xs text-gray-500 sm:grid-cols-2">
            {[
              ['bg-yellow-500', 'price reaches your entry zone'],
              ['bg-red-500', 'price breaks your invalidation level'],
              ['bg-green-500', 'price hits your target'],
              ['bg-amber-500', 'a move is unusually large for that stock'],
              ['bg-gray-500', 'earnings or your catalyst is within a week'],
              ['bg-gray-500', 'fresh news coverage appears'],
            ].map(([dot, label]) => (
              <li key={label} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-800/60 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-700 p-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">While you were away</h2>
          <p className="text-sm text-gray-500">
            {lastVisit
              ? `You last checked ${whenExactly(lastVisit)} — ${timeAgo(lastVisit)}`
              : 'Since your first visit'}{' '}
            · {counts.unseenEvents} update{counts.unseenEvents === 1 ? '' : 's'} across {groups.length} name
            {groups.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={reviewAll}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:border-yellow-500 hover:text-yellow-500 disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Mark all reviewed
        </button>
      </header>

      <div className="grid grid-cols-2 gap-px bg-gray-700 sm:grid-cols-4">
        <Stat label="Tracked" value={counts.itemsTracked} />
        <Stat label="Need attention" value={counts.needsAttention} tone={counts.needsAttention ? 'amber' : undefined} />
        <Stat label="Invalidated" value={counts.invalidated} tone={counts.invalidated ? 'red' : undefined} />
        <Stat label="Quiet" value={counts.quiet} />
      </div>

      <ul className="divide-y divide-gray-700">
        {groups.map((g) => {
          const tier = severityTier(g.maxSeverity);
          const meta = TIER_META[tier];
          const isOpen = expanded[g.symbol] ?? g.maxSeverity >= 70;
          return (
            <li key={g.symbol} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  className="flex flex-1 items-start gap-3 text-left"
                  onClick={() => setExpanded((e) => ({ ...e, [g.symbol]: !isOpen }))}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  <span className="flex-1">
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/stocks/${g.symbol}`}
                        className="font-semibold text-gray-100 hover:text-yellow-500"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {g.symbol}
                      </Link>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.text} ring-1 ${meta.ring}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-gray-500">{g.events.length} update{g.events.length === 1 ? '' : 's'}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-gray-400">{g.events[0]?.detail}</span>

                    {/* Literal was → now across the away-window */}
                    {g.deltas.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {g.deltas.map((d, i) => {
                          const before = d.before ?? 0;
                          const after = d.after ?? 0;
                          const good =
                            d.goodDirection == null
                              ? null
                              : d.goodDirection === 'toward-zero'
                                ? Math.abs(after) < Math.abs(before)
                                : after > before
                                  ? d.goodDirection === 'up'
                                  : d.goodDirection === 'down';
                          const color = good === null ? 'text-gray-300' : good ? 'text-green-500' : 'text-red-400';
                          return (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded bg-gray-900/70 px-2 py-0.5 text-[11px] tabular-nums"
                            >
                              <span className="text-gray-500">{d.label}</span>
                              <span className="text-gray-500">{fmtDelta(d.before, d.kind)}</span>
                              <ArrowRight className="h-3 w-3 text-gray-600" />
                              <span className={color}>{fmtDelta(d.after, d.kind)}</span>
                            </span>
                          );
                        })}
                      </span>
                    )}

                    {isOpen && g.events.length > 1 && (
                      <ul className="mt-2 space-y-1.5 border-l border-gray-700 pl-3">
                        {g.events.slice(1).map((ev, i) => (
                          <li key={i} className="text-sm text-gray-400">
                            <span className="text-xs text-gray-500">{CHANGE_TYPE_LABEL[ev.type] ?? ev.type} · {timeAgo(ev.createdAt)}</span>
                            <br />
                            {ev.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </span>
                  <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-gray-500 transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <button
                  onClick={() => reviewSymbol(g.symbol)}
                  disabled={pending}
                  className="shrink-0 rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:opacity-50"
                >
                  Reviewed
                </button>
              </div>

              {/* Triage: a broken thesis needs a decision, not just a "seen". */}
              {g.events.some((e) => e.type === 'invalidation_breached') && (
                <div className="mt-2 flex flex-wrap gap-2 pl-5 text-xs">
                  <span className="self-center text-gray-500">Decide:</span>
                  <button
                    onClick={() => reviewSymbol(g.symbol)}
                    disabled={pending}
                    className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:border-yellow-500 hover:text-yellow-500 disabled:opacity-50"
                  >
                    Keep on list
                  </button>
                  <button
                    onClick={() => snooze(g.symbol)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-gray-300 hover:border-gray-500 disabled:opacity-50"
                  >
                    <BellOff className="h-3 w-3" /> Mute 1wk
                  </button>
                  <button
                    onClick={() => cull(g.symbol)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-gray-300 hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> Cull
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'red' }) {
  const color = tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : 'text-gray-100';
  return (
    <div className="bg-gray-800 p-4">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
