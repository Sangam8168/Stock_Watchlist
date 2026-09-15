'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, ChevronLeft, ChevronRight, Check, ArrowRight } from 'lucide-react';
import { markSeen } from '@/lib/actions/watchlist.actions';
import { notifySeenChanged } from '@/components/watchlist/WatchlistNavLink';
import { severityTier, TIER_META, CHANGE_TYPE_LABEL, timeAgo, fmtDelta } from '@/lib/changes/display';

/**
 * A 30-second morning scan: one change per card, swipe or arrow through them.
 *
 * The feed view is better for triage — you can compare, filter, act on one item
 * and skip five. This is for the other mode: catching up, quickly, without
 * deciding anything yet. Reviewing happens per card as you pass it, so putting
 * the phone down halfway leaves the rest genuinely unseen.
 */
interface Card {
  symbol: string;
  company: string;
  type: string;
  detail: string;
  severity: number;
  createdAt: string;
  deltas: ValueDelta[];
}

export default function StoryMode({
  digest,
  deviceId,
  onClose,
}: {
  digest: SinceYouLeftDigest;
  deviceId: string;
  onClose: () => void;
}) {
  // Highest severity first — if you only look at one card, it should be the
  // one that matters most.
  const cards: Card[] = digest.groups
    .flatMap((g) =>
      g.events.map((e, i) => ({
        symbol: g.symbol,
        company: g.company,
        type: e.type,
        detail: e.detail,
        severity: e.severity,
        createdAt: e.createdAt,
        // Deltas belong to the symbol, so only show them on its first card.
        deltas: i === 0 ? g.deltas : [],
      }))
    )
    .sort((a, b) => b.severity - a.severity);

  const [i, setI] = useState(0);
  const reviewed = useRef<Set<string>>(new Set());
  const touchX = useRef<number | null>(null);

  const markCurrent = useCallback(() => {
    const c = cards[i];
    if (!c || reviewed.current.has(c.symbol)) return;
    reviewed.current.add(c.symbol);
    void markSeen(deviceId, [c.symbol]).then(notifySeenChanged).catch(() => {});
  }, [cards, i, deviceId]);

  const next = useCallback(() => {
    markCurrent();
    setI((n) => (n + 1 < cards.length ? n + 1 : n));
  }, [markCurrent, cards.length]);

  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  if (!cards.length) return null;
  const c = cards[i];
  const meta = TIER_META[severityTier(c.severity)];
  const last = i === cards.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-gray-950/95 backdrop-blur-sm"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx < -50) next();
        else if (dx > 50) prev();
        touchX.current = null;
      }}
    >
      {/* Progress: one segment per card, filled as you pass it. */}
      <div className="flex gap-1 p-3">
        {cards.map((_, n) => (
          <span
            key={n}
            className={`h-0.5 flex-1 rounded-full transition-colors ${n <= i ? 'bg-yellow-500' : 'bg-gray-700'}`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pb-2">
        <span className="text-xs text-gray-500">
          {i + 1} of {cards.length}
        </span>
        <button onClick={onClose} className="rounded p-1 text-gray-500 hover:text-gray-200" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-6">
        <div key={i} className="auth-beat w-full max-w-md">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            <Link href={`/stocks/${c.symbol}`} className="text-2xl font-bold text-gray-100 hover:text-yellow-500">
              {c.symbol}
            </Link>
            <span className="truncate text-sm text-gray-500">{c.company}</span>
          </div>

          <p className={`mt-3 text-xs font-medium uppercase tracking-wide ${meta.text}`}>
            {CHANGE_TYPE_LABEL[c.type] ?? c.type} · {timeAgo(c.createdAt)}
          </p>

          <p className="mt-2 text-lg leading-relaxed text-gray-200">{c.detail}</p>

          {c.deltas.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {c.deltas.map((d, n) => {
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
                return (
                  <div key={n} className="flex items-center gap-2 text-sm tabular-nums">
                    <span className="w-32 shrink-0 text-gray-600">{d.label}</span>
                    <span className="text-gray-500">{fmtDelta(d.before, d.kind)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-gray-700" />
                    <span className={good === null ? 'text-gray-300' : good ? 'text-green-500' : 'text-red-400'}>
                      {fmtDelta(d.after, d.kind)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-800 p-4">
        <button
          onClick={prev}
          disabled={i === 0}
          className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <span className="hidden text-[11px] text-gray-700 sm:block">← → or swipe</span>
        <button
          onClick={() => (last ? (markCurrent(), onClose()) : next())}
          className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-gray-950 hover:opacity-90"
        >
          {last ? <><Check className="h-4 w-4" /> Done</> : <>Next <ChevronRight className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  );
}
