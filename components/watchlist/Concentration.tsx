'use client';

import { concentration } from '@/lib/changes/concentration';

const BARS = [
  'bg-yellow-500', 'bg-sky-500', 'bg-emerald-500', 'bg-violet-500',
  'bg-rose-500', 'bg-amber-600', 'bg-teal-500', 'bg-gray-600',
];

/**
 * The shape of the list, rather than the state of any one name in it.
 *
 * Hidden below five holdings: with three names "you're 66% technology" is
 * arithmetic, not insight, and dressing it up as a warning would train the user
 * to ignore the panel.
 */
export default function Concentration({ entries }: { entries: WatchlistEntry[] }) {
  const r = concentration(entries.map((e) => ({ sector: e.sector, marketValue: e.marketValue, currency: e.currency })));
  if (!r.verdict || r.slices.length < 2) return null;

  const byValue = r.slices.some((s) => s.valuePct != null);

  return (
    <section className="surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-200">Concentration</h2>
        <span className="text-xs text-gray-600">
          {r.tracked} names · weighted by {byValue ? 'position value' : 'count'}
        </span>
      </div>

      <p className="mt-1 text-sm text-gray-400">{r.verdict}</p>

      {/* One stacked bar reads faster than a legend of percentages. */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/5">
        {r.slices.map((s, i) => (
          <span
            key={s.label}
            className={BARS[i % BARS.length]}
            style={{ width: `${s.valuePct ?? s.pct}%` }}
            title={`${s.label} — ${(s.valuePct ?? s.pct).toFixed(1)}%`}
          />
        ))}
      </div>

      <ul className="mt-3 grid gap-x-5 gap-y-1 text-xs sm:grid-cols-2">
        {r.slices.slice(0, 6).map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${BARS[i % BARS.length]}`} />
            <span className="flex-1 truncate text-gray-400">{s.label}</span>
            <span className="tabular-nums text-gray-500">{(s.valuePct ?? s.pct).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
