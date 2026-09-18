'use client';

import { useEffect, useRef, useState } from 'react';
import { Columns3, RotateCcw, X } from 'lucide-react';
import { COLUMN_GROUPS, COLUMN_LABEL, TABLE_VIEWS, type Col, type TableView } from '@/components/watchlist/WatchlistTable';

/**
 * Build your own column set.
 *
 * The presets cover the common questions, but "which columns matter" is
 * genuinely personal — a dividend investor and a momentum trader want different
 * tables. Selecting nothing falls back to the active preset rather than showing
 * an empty table, so there is no broken state to get stuck in.
 */
export default function ColumnPicker({
  view,
  value,
  onChange,
}: {
  view: TableView;
  value: Col[] | null;
  onChange: (cols: Col[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // With no custom set, show the preset's columns as the starting point.
  const active = new Set<Col>(value ?? TABLE_VIEWS.find((v) => v.key === view)!.cols);

  const toggle = (c: Col) => {
    const next = new Set(active);
    next.has(c) ? next.delete(c) : next.add(c);
    next.delete('symbol'); // always implied
    onChange(next.size ? ([...next] as Col[]) : null);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Choose which columns to show"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
          value ? 'border-yellow-500/50 text-yellow-500' : 'border-gray-600 text-gray-300 hover:border-gray-400'
        }`}
      >
        <Columns3 className="h-3.5 w-3.5" />
        {value ? `${value.length} columns` : 'Columns'}
      </button>

      {open && (
        <div className="surface absolute right-0 z-40 mt-1 w-72 !p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b hairline px-3 py-2">
            <span className="text-xs font-medium text-gray-300">Show columns</span>
            <div className="flex items-center gap-1">
              {value && (
                <button
                  onClick={() => onChange(null)}
                  title="Back to the preset"
                  className="rounded p-1 text-gray-500 hover:text-gray-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-500 hover:text-gray-200">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto px-3 py-2">
            {COLUMN_GROUPS.map((g) => (
              <div key={g.group} className="mb-3 last:mb-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">{g.group}</p>
                <div className="flex flex-wrap gap-1">
                  {g.cols.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggle(c)}
                      className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                        active.has(c)
                          ? 'bg-yellow-500 text-gray-950'
                          : 'border border-white/10 text-gray-400 hover:border-white/25 hover:text-gray-200'
                      }`}
                    >
                      {COLUMN_LABEL(c)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="border-t hairline px-3 py-2 text-[10px] text-gray-600">
            Symbol is always shown. Clearing every column returns to the preset.
          </p>
        </div>
      )}
    </div>
  );
}
