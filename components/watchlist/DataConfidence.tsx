'use client';

import { ShieldAlert, ShieldCheck, Clock, AlertTriangle, Ban } from 'lucide-react';
import { assessConfidence, confidenceLabel } from '@/lib/changes/confidence';
import { isMarketOpenFor } from '@/lib/changes/exchange';

/**
 * How much this row's numbers are worth trusting.
 *
 * Computed at read time from the snapshot we already hold, so it applies to
 * every existing row immediately rather than waiting for the next write. A
 * perfectly healthy quote renders nothing at all — a badge on every row would
 * be wallpaper, and wallpaper is not a warning.
 */
export default function DataConfidence({ entry }: { entry: WatchlistEntry }) {
  // A dead ticker outranks every freshness question: there is no quote to grade,
  // and the fix is to edit the watchlist rather than to wait for the next poll.
  if (entry.symbolNotFound) {
    return (
      <span
        title="The exchange has no listing under this symbol. Search for the company to find its current ticker."
        className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-400"
      >
        <Ban className="h-3 w-3" />
        No longer listed
      </span>
    );
  }

  const r = assessConfidence({
    asOf: entry.dataAsOf ? new Date(entry.dataAsOf) : null,
    hasQuote: typeof entry.price === 'number' && entry.price > 0,
    unconfirmedFields: entry.unconfirmedFields,
    marketOpen: isMarketOpenFor(entry.symbol),
    price: entry.price,
    week52High: entry.week52High,
    week52Low: entry.week52Low,
  });

  if (r.score >= 1) return null;

  const { label, tone } = confidenceLabel(r.band);
  const conflicted = r.conflicts.length > 0;
  const Icon = conflicted ? AlertTriangle : r.band === 'live' ? ShieldCheck : r.band === 'unusable' ? ShieldAlert : Clock;

  return (
    <span
      title={r.reasons.join(' · ')}
      className={`inline-flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] ${tone}`}
    >
      <Icon className="h-3 w-3" />
      {conflicted ? 'Provider disagrees with itself' : label}
      <span className="tabular-nums opacity-70">{r.score.toFixed(2)}</span>
    </span>
  );
}
