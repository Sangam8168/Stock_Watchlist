'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { searchStocks } from '@/lib/actions/finnhub.actions';
import { useDebounce } from '@/hooks/useDebounce';
import ThesisDialog from '@/components/watchlist/ThesisDialog';

export default function AddSymbol({ onAdded, list }: { onAdded: () => void; list?: string }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<StockWithWatchlistStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [openList, setOpenList] = useState(false);
  // The dialog is rendered at the root of this component — NOT inside the result
  // rows — so closing the dropdown can never unmount it mid-interaction.
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const run = async () => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      setResults(await searchStocks(term.trim()));
    } finally {
      setLoading(false);
    }
  };
  const debounced = useDebounce(run, 300);
  useEffect(() => {
    debounced();
    setOpenList(true);
  }, [term]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Ignore clicks inside any Radix portal (dialog, select popper) — they're
      // rendered on document.body, i.e. outside boxRef.
      if (target?.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
      if (boxRef.current && !boxRef.current.contains(target)) setOpenList(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (symbol: string, name: string) => {
    setSelected({ symbol, name });
    setOpenList(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-md border border-gray-600 bg-gray-800 px-3">
        <Search className="h-4 w-4 text-gray-500" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => setOpenList(true)}
          placeholder="Add a stock — search by symbol or name"
          className="h-10 flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
        />
        {loading && <span className="text-xs text-gray-500">…</span>}
      </div>

      {openList && term.trim() && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-gray-600 bg-gray-800 shadow-xl">
          {results.length === 0 && !loading ? (
            <p className="px-3 py-3 text-sm text-gray-500">No matches</p>
          ) : (
            results.map((s) => (
              <button
                key={s.symbol}
                type="button"
                onClick={() => pick(s.symbol, s.name)}
                className="flex w-full items-center justify-between gap-2 border-b border-gray-700 px-3 py-2 text-left last:border-0 hover:bg-gray-700/60"
              >
                <span>
                  <span className="text-sm font-medium text-gray-100">{s.symbol}</span>
                  <span className="ml-2 text-xs text-gray-500">{s.name}</span>
                </span>
                <Plus className="h-4 w-4 text-yellow-500" />
              </button>
            ))
          )}
        </div>
      )}

      {selected && (
        <ThesisDialog
          list={list}
          key={selected.symbol}
          symbol={selected.symbol}
          company={selected.name}
          mode="add"
          open
          onOpenChange={(v) => {
            if (!v) setSelected(null);
          }}
          onDone={() => {
            setSelected(null);
            setTerm('');
            setResults([]);
            onAdded();
          }}
        />
      )}
    </div>
  );
}
