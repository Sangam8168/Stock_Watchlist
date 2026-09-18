'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Plus, Pencil, Trash2, Check } from 'lucide-react';

export interface ListSummary {
  name: string;
  count: number;
}

/**
 * Switching between named lists.
 *
 * A horizontal tab strip is the right control for a handful of lists — every
 * option visible, one click to switch. It is the wrong control for fifty: it
 * wraps over several rows, pushes the actual watchlist below the fold, and
 * offers no way to find a list except reading all of them.
 *
 * So the control changes shape with the data. Below the threshold you get tabs;
 * above it, a single button that opens a searchable picker. Same state, same
 * actions, bounded height either way.
 */
const TABS_UP_TO = 6;

export default function ListSwitcher({
  lists,
  active,
  unread = {},
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  lists: ListSummary[];
  active: string;
  /** Unread update count per list name. Absent or 0 renders nothing. */
  unread?: Record<string, number>;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    // Typing should filter immediately — that's the whole point of the picker.
    searchRef.current?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return lists;
    return lists.filter((l) => l.name.toLowerCase().includes(t));
  }, [lists, q]);

  // The count of stocks is grey and structural; unread updates are the thing
  // you came back for, so they get the accent and sit outside the tally.
  const Unread = ({ name }: { name: string }) => {
    const n = unread[name] ?? 0;
    if (!n) return null;
    return (
      <span
        title={`${n} unread update${n === 1 ? '' : 's'} in "${name}"`}
        className="rounded-full bg-yellow-500/15 px-1.5 text-[10px] font-semibold text-yellow-500"
      >
        {n > 99 ? '99+' : n}
      </span>
    );
  };

  const manage = active !== 'Main' && (
    <span className="flex items-center gap-0.5">
      <button
        onClick={onRename}
        title={`Rename "${active}"`}
        className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-300"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        title={`Delete "${active}" (stocks move back to Main)`}
        className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-800 hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  );

  // --- Few lists: everything visible ---------------------------------------
  if (lists.length <= TABS_UP_TO) {
    return (
      <div className="flex flex-wrap items-center gap-1 border-b hairline print:hidden">
        {lists.map((l) => (
          <button
            key={l.name}
            onClick={() => onSelect(l.name)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              active === l.name
                ? 'border-yellow-500 text-gray-100'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {l.name}
            <span className={`rounded-full px-1.5 text-[10px] ${active === l.name ? 'bg-gray-700 text-gray-300' : 'text-gray-600'}`}>
              {l.count}
            </span>
            <Unread name={l.name} />
          </button>
        ))}
        {manage}
        <button
          onClick={onCreate}
          className="ml-2 rounded-md border border-dashed border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:border-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-500"
          title="Create a new list"
        >
          + New list
        </button>
      </div>
    );
  }

  // --- Many lists: one button, searchable picker ----------------------------
  const activeCount = lists.find((l) => l.name === active)?.count ?? 0;
  // With the picker closed the other lists are off screen entirely, so the
  // button has to carry news from lists you cannot currently see.
  const unreadElsewhere = lists.reduce((n, l) => (l.name === active ? n : n + (unread[l.name] ?? 0)), 0);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b hairline pb-2 print:hidden" ref={boxRef}>
      <div className="relative">
        <button
          onClick={() => { setOpen((v) => !v); setQ(''); }}
          className="inline-flex items-center gap-2 rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 transition-colors hover:border-gray-500"
        >
          <span className="max-w-[14rem] truncate font-medium">{active}</span>
          <span className="rounded-full bg-gray-700 px-1.5 text-[10px] text-gray-300">{activeCount}</span>
          <Unread name={active} />
          {unreadElsewhere > 0 && (
            <span
              title={`${unreadElsewhere} unread update${unreadElsewhere === 1 ? '' : 's'} in your other lists`}
              className="rounded-full px-1.5 text-[10px] text-gray-500 ring-1 ring-yellow-500/30"
            >
              +{unreadElsewhere > 99 ? '99+' : unreadElsewhere} elsewhere
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute left-0 z-30 mt-1 w-72 overflow-hidden rounded-md border border-gray-600 bg-gray-800 shadow-xl">
            <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${lists.length} lists…`}
                className="w-full bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-600"
              />
            </div>

            {/* Bounded height: the picker must not grow with the data either. */}
            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-500">No list matches &ldquo;{q}&rdquo;</p>
              ) : (
                filtered.map((l) => (
                  <button
                    key={l.name}
                    onClick={() => { onSelect(l.name); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-700/60 ${
                      active === l.name ? 'text-yellow-500' : 'text-gray-300'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {active === l.name ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5" />}
                      <span className="truncate">{l.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-gray-600">
                      {l.count}
                      <Unread name={l.name} />
                    </span>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => { setOpen(false); onCreate(); }}
              className="flex w-full items-center gap-2 border-t border-gray-700 px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-700/60 hover:text-yellow-500"
            >
              <Plus className="h-3.5 w-3.5" /> New list
            </button>
          </div>
        )}
      </div>

      {manage}
      <span className="text-xs text-gray-600">{lists.length} lists</span>
    </div>
  );
}
