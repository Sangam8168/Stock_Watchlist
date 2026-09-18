'use client';

import { useState } from 'react';
import { Info, User, LineChart, ShieldAlert } from 'lucide-react';
import { explainSeverity } from '@/lib/changes/explain';
import { severityTier, TIER_META } from '@/lib/changes/display';

/**
 * "Why is this at the top of my list?"
 *
 * A ranking nobody can interrogate is a ranking nobody should trust — and this
 * app already refuses to assert anything it cannot show working for. The score
 * was the last place still asking to be taken on faith.
 *
 * Collapsed to the tier badge until asked. The breakdown is reconstructed from
 * the event's own stored data, so it cannot drift away from the number it
 * explains; the tests assert the factors sum back to the score.
 */
export default function WhyRanked({
  event,
}: {
  event: { type: string; severity: number; data?: Record<string, unknown> };
}) {
  const [open, setOpen] = useState(false);
  const e = explainSeverity(event);
  const meta = TIER_META[severityTier(event.severity)];
  const ScopeIcon = e.scope === 'thesis' ? User : e.scope === 'data' ? ShieldAlert : LineChart;

  return (
    <span className="relative inline-flex">
      <button
        onClick={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        title="Why is this ranked here?"
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 transition-colors ${meta.text} ${meta.ring} hover:bg-white/5`}
      >
        {meta.label}
        <Info className="h-2.5 w-2.5 opacity-60" />
      </button>

      {open && (
        <span
          className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-white/10 bg-[#16181c] p-3 shadow-xl"
          onClick={(ev) => ev.stopPropagation()}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Why this rank</span>
            <span className={`text-lg font-semibold tabular-nums ${meta.text}`}>{e.total}</span>
          </span>

          <span className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-gray-500">
            <ScopeIcon className="mt-0.5 h-3 w-3 shrink-0" />
            {e.headline}
          </span>

          <span className="mt-2 block space-y-1.5 border-t hairline pt-2">
            {e.factors.map((f, i) => (
              <span key={i} className="block">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-gray-300">{f.label}</span>
                  <span className="text-xs tabular-nums text-gray-400">
                    {f.points > 0 ? '+' : ''}
                    {Math.round(f.points)}
                  </span>
                </span>
                <span className="block text-[11px] leading-snug text-gray-600">{f.note}</span>
              </span>
            ))}
          </span>

          {e.scope === 'symbol' && (
            <span className="mt-2 block border-t hairline pt-2 text-[10px] leading-snug text-gray-600">
              Computed once for this stock and shared by everyone watching it. Only levels you set yourself are
              scored per person.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
