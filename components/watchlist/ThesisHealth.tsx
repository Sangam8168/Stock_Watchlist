'use client';

import { thesisHealth, healthBand } from '@/lib/changes/health';

/**
 * One glance at "how is my list doing" before opening anything.
 *
 * The score is never shown alone — a number with no explanation is a vanity
 * metric, and the interesting part is always *why* it moved.
 */
export default function ThesisHealth({ entries }: { entries: WatchlistEntry[] }) {
  const report = thesisHealth(
    entries.map((e) => ({
      symbol: e.symbol,
      distanceToEntryPct: e.distanceToEntryPct,
      invalidationPrice: e.invalidationPrice,
      targetPrice: e.targetPrice,
      entryLow: e.entryLow,
      entryHigh: e.entryHigh,
      price: e.price,
      direction: e.direction,
      daysSinceReview: e.daysSinceReview,
      events: e.events,
    }))
  );

  if (report.score == null) return null;
  const band = healthBand(report.score);

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-700 bg-gray-800/50 p-4">
      <div
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ring-2 ${band.ring}`}
        title={`Thesis health across ${report.tracked} tracked ${report.tracked === 1 ? 'item' : 'items'}`}
      >
        <span className={`text-xl font-semibold tabular-nums ${band.text}`}>{report.score}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${band.text}`}>{band.label}</p>
        {report.reasons.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {report.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            Every thesis is intact and nothing is near a level you set.
          </p>
        )}
      </div>
    </section>
  );
}
