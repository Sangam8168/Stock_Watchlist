'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, ChevronDown, BellOff, Trash2, ArrowRight, Play, Eye, CloudOff, Ban } from 'lucide-react';
import { markSeen, removeFromWatchlist, snoozeWatchlistItem } from '@/lib/actions/watchlist.actions';
import { notifySeenChanged } from '@/components/watchlist/WatchlistNavLink';
import { useRecordVisit } from '@/hooks/useRecordVisit';
import { severityTier, TIER_META, CHANGE_TYPE_LABEL, timeAgo, whenExactly, fmtDelta } from '@/lib/changes/display';
import StoryMode from '@/components/watchlist/StoryMode';
import EventSource from '@/components/watchlist/EventSource';
import WhyRanked from '@/components/watchlist/WhyRanked';

interface Props {
  digest: SinceYouLeftDigest;
  deviceId: string;
  onReviewed: () => void;
  onItemChange?: () => void;
}

/** How long a group must stay on screen before it counts as read. */
const DWELL_MS = 1500;
/** Collect dwell hits briefly so one scroll past five names is one request. */
const FLUSH_MS = 800;

export default function SinceYouLeft({ digest, deviceId, onReviewed, onItemChange }: Props) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [story, setStory] = useState(false);
  const { counts, groups, lastVisit } = digest;
  const previousVisit = useRecordVisit(deviceId);
  const checked = previousVisit ?? lastVisit;

  const after = onItemChange ?? onReviewed;

  // ---------------------------------------------------------------------------
  // Reading counts as reviewing.
  //
  // Previously the only thing that cleared an update was clicking "Mark all
  // reviewed", so the banner kept saying "31 updates since your last visit"
  // to someone who had visited a minute ago and read all 31. The count has to
  // respond to what you actually looked at.
  //
  // "Looked at" is deliberately strict: the group must be at least half on
  // screen, for a continuous DWELL_MS, in a foreground tab. Rendering below the
  // fold or flicking past at speed does not count — the whole point of the
  // watermark is that nothing disappears unseen.
  //
  // Note this marks seen on the server but does NOT refetch: the list stays put
  // while you are reading it, and is simply gone next time.
  // ---------------------------------------------------------------------------
  const listRef = useRef<HTMLUListElement>(null);
  const dwell = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queued = useRef(new Set<string>());
  const sent = useRef(new Set<string>());
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSeen = useCallback(() => {
    const batch = [...queued.current];
    queued.current.clear();
    if (!batch.length || !deviceId) return;
    batch.forEach((sym) => sent.current.add(sym));
    markSeen(deviceId, batch)
      .then(notifySeenChanged)
      // A failed mark just means it shows again next visit — the safe direction.
      .catch(() => batch.forEach((sym) => sent.current.delete(sym)));
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const symbol = (entry.target as HTMLElement).dataset.symbol;
          if (!symbol) continue;
          const timer = dwell.current.get(symbol);
          // Half the group on screen counts as reading it — but a group with
          // many events expanded can be taller than the viewport and so can
          // never reach a 0.5 ratio. For those, half a screenful of it being
          // visible is the same thing, and without this they nag forever.
          const viewport = entry.rootBounds?.height ?? 0;
          const read =
            entry.isIntersecting &&
            (entry.intersectionRatio >= 0.5 || (viewport > 0 && entry.intersectionRect.height >= viewport * 0.5));
          if (read) {
            if (timer || sent.current.has(symbol)) continue;
            dwell.current.set(
              symbol,
              setTimeout(() => {
                dwell.current.delete(symbol);
                // A backgrounded tab can still report intersection; that is not reading.
                if (document.visibilityState !== 'visible') return;
                queued.current.add(symbol);
                if (flush.current) clearTimeout(flush.current);
                flush.current = setTimeout(flushSeen, FLUSH_MS);
              }, DWELL_MS)
            );
          } else if (timer) {
            clearTimeout(timer);
            dwell.current.delete(symbol);
          }
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75] }
    );

    // Collected from the DOM rather than through per-item callback refs: the
    // group list only changes when `digest` does, which is already a dependency.
    listRef.current?.querySelectorAll<HTMLElement>('[data-symbol]').forEach((el) => observer.observe(el));
    const timers = dwell.current;
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
      timers.clear();
      if (flush.current) clearTimeout(flush.current);
      // Don't lose a dwell that completed just as the user navigated away.
      flushSeen();
    };
  }, [deviceId, flushSeen, digest]);

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
    // Silence has two causes and they are not interchangeable: nothing happened,
    // or we could not see. An outage writes no snapshots, so it produces no
    // events, so it would otherwise render as a reassuring green tick at exactly
    // the moment the app has gone blind. Never claim quiet we cannot vouch for.
    const blind = !digest.coverage.canAssertQuiet;
    const n = digest.coverage.unseen.length;
    const gone = digest.coverage.delisted;

    return (
      <div className="surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            {blind ? (
              <CloudOff className="h-4 w-4 text-amber-400" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-green-500" />
            )}
            {blind ? "Can't confirm" : 'All quiet'}
          </h2>
          <span className="text-xs text-gray-600">
            {checked ? `checked ${timeAgo(checked)}` : 'first visit'}
          </span>
        </div>
        {blind ? (
          <p className="mt-1.5 text-sm text-gray-400">
            No change to report &mdash; but we haven&rsquo;t had a fresh price for{' '}
            <span className="font-medium text-amber-400">
              {n} of {digest.coverage.total}
            </span>{' '}
            {digest.coverage.total === 1 ? 'name' : 'names'}
            {digest.coverage.oldestUnseenAt && <> since {timeAgo(digest.coverage.oldestUnseenAt)}</>}, so this
            silence isn&rsquo;t proof that nothing moved.
            <span className="mt-1 block text-xs text-gray-600">
              Waiting on: {digest.coverage.unseen.slice(0, 6).join(', ')}
              {n > 6 && ` +${n - 6} more`} · usually a provider rate limit; the next 15-minute poll retries.
            </span>
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-gray-500">
            Watching <span className="font-medium text-gray-300">{counts.itemsTracked}</span>{' '}
            {counts.itemsTracked === 1 ? 'thesis' : 'theses'}. Nothing has crossed a level you set.
          </p>
        )}

        {gone.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/[0.06] p-2.5 text-xs text-gray-400">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>
              <span className="font-medium text-amber-400">
                {gone.join(', ')} no longer {gone.length === 1 ? 'trades' : 'trade'} under{' '}
                {gone.length === 1 ? 'that ticker' : 'those tickers'}.
              </span>{' '}
              Indian listings get renamed and demerged often — Zomato became ETERNAL, Tata Motors split off TMPV.
              Search for the company to find its current symbol, then remove{' '}
              {gone.length === 1 ? 'this row' : 'these rows'}. Nothing here can update until you do.
            </span>
          </p>
        )}

        <div className="mt-3 border-t hairline pt-3">
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
    <>
      {story && (
        <StoryMode
          digest={digest}
          deviceId={deviceId}
          onClose={() => {
            setStory(false);
            onReviewed();
          }}
        />
      )}
    <section className="surface !p-0 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b hairline p-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">While you were away</h2>
          <p className="text-sm text-gray-500">
            {checked ? `You last checked ${whenExactly(checked)} — ${timeAgo(checked)}` : 'Since your first visit'}{' '}
            · {counts.unseenEvents} update{counts.unseenEvents === 1 ? '' : 's'} across {groups.length} name
            {groups.length === 1 ? '' : 's'}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
            <Eye className="h-3 w-3" /> These clear themselves as you read them — they stay on screen for this visit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStory(true)}
            title="One change per card — a 30-second catch-up"
            className="flex items-center gap-1.5 rounded-md bg-yellow-500 px-3 py-1.5 text-sm font-medium text-gray-950 hover:opacity-90"
          >
            <Play className="h-4 w-4" /> Catch me up
          </button>
          <button
            onClick={reviewAll}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:border-yellow-500 hover:text-yellow-500 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Mark all reviewed
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        <Stat label="Tracked" value={counts.itemsTracked} />
        <Stat label="Need attention" value={counts.needsAttention} tone={counts.needsAttention ? 'amber' : undefined} />
        <Stat label="Invalidated" value={counts.invalidated} tone={counts.invalidated ? 'red' : undefined} />
        <Stat label="Quiet" value={counts.quiet} />
      </div>

      <ul ref={listRef} className="divide-y divide-white/5">
        {groups.map((g) => {
          const tier = severityTier(g.maxSeverity);
          const meta = TIER_META[tier];
          const isOpen = expanded[g.symbol] ?? g.maxSeverity >= 70;
          return (
            <li key={g.symbol} data-symbol={g.symbol} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-1 items-start gap-3 text-left">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  <span className="flex-1">
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/stocks/${g.symbol}`}
                        className="font-semibold text-gray-100 hover:text-yellow-500"
                      >
                        {g.symbol}
                      </Link>
                      {g.events[0] ? (
                        <WhyRanked event={g.events[0]} />
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.text} ring-1 ${meta.ring}`}>
                          {meta.label}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">{g.events.length} update{g.events.length === 1 ? '' : 's'}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-gray-400">{g.events[0]?.detail}</span>
                    {g.events[0] && <EventSource data={g.events[0].data} />}

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
                      <ul className="mt-2 space-y-1.5 border-l hairline pl-3">
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
                  {g.events.length > 1 && (
                    <button
                      onClick={() => setExpanded((e) => ({ ...e, [g.symbol]: !isOpen }))}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? `Hide the other ${g.events.length - 1} updates for ${g.symbol}` : `Show the other ${g.events.length - 1} updates for ${g.symbol}`}
                      className="mt-0.5 shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
                    >
                      <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => reviewSymbol(g.symbol)}
                  disabled={pending}
                  className="shrink-0 rounded border border-white/10 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:opacity-50"
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
                    className="rounded border border-white/10 px-2 py-1 text-gray-300 hover:border-yellow-500 hover:text-yellow-500 disabled:opacity-50"
                  >
                    Keep on list
                  </button>
                  <button
                    onClick={() => snooze(g.symbol)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-gray-300 hover:border-gray-500 disabled:opacity-50"
                  >
                    <BellOff className="h-3 w-3" /> Mute 1wk
                  </button>
                  <button
                    onClick={() => cull(g.symbol)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-gray-300 hover:border-red-500 hover:text-red-400 disabled:opacity-50"
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
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'red' }) {
  const color = tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : 'text-gray-100';
  return (
    <div className="bg-[#16181c] p-4">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
