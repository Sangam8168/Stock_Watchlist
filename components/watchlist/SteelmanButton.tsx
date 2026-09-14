'use client';

import { useState } from 'react';
import { Swords, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getBearCase } from '@/lib/actions/steelman.actions';

/**
 * On-demand counterargument. Never runs automatically: it costs a model call,
 * and an unsolicited "here's why you're wrong" on every row would be noise
 * rather than a gut-check.
 */
export default function SteelmanButton({ symbol, direction }: { symbol: string; direction: 'long' | 'short' }) {
  const [points, setPoints] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await getBearCase(symbol);
      if (res.ok && res.points) setPoints(res.points);
      else toast.error(res.reason || 'Could not generate the other side');
    } catch {
      toast.error('Could not reach the AI service');
    } finally {
      setLoading(false);
    }
  };

  const label = direction === 'short' ? 'Argue the bull case' : 'Argue the bear case';

  if (points) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Swords className="h-3.5 w-3.5" /> The other side
          </p>
          <button onClick={() => setPoints(null)} className="text-[11px] text-gray-600 hover:text-gray-400">
            hide
          </button>
        </div>
        <ul className="mt-2 space-y-1.5">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-300">
              <span className="text-gray-600">{i + 1}.</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-gray-800 pt-2 text-[10px] leading-relaxed text-gray-600">
          AI-generated from your thesis, with no access to live market data. Points that depend on
          current conditions need verifying. Not advice.
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      title="Pressure-test your reasoning against the strongest opposing case"
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Swords className="h-3.5 w-3.5" />}
      {loading ? 'Thinking…' : label}
    </button>
  );
}
