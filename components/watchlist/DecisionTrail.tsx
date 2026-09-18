'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { getThesisRevisions } from '@/lib/actions/watchlist.actions';
import { describeChange, type FieldChange } from '@/lib/changes/revision';
import { timeAgo } from '@/lib/changes/display';

interface Revision {
  createdAt: string;
  loosened: boolean;
  changes: { field: string; from: string | number | null; to: string | number | null }[];
}

/**
 * How this thesis has changed. Read next to a broken thesis, the useful question
 * is rarely "what was the price" but "when did I start moving the goalposts?".
 */
export default function DecisionTrail({ symbol }: { symbol: string }) {
  const [rows, setRows] = useState<Revision[] | null>(null);

  useEffect(() => {
    getThesisRevisions(symbol).then(setRows).catch(() => setRows([]));
  }, [symbol]);

  if (rows === null) return null;
  if (!rows.length) {
    return (
      <p className="text-xs text-gray-600">
        No edits yet — this thesis is as you first wrote it.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <History className="h-3.5 w-3.5" /> Decision trail
      </p>
      <ol className="space-y-2 border-l hairline pl-3">
        {rows.map((r, i) => (
          <li key={i} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">{timeAgo(r.createdAt)}</span>
              {r.loosened && (
                <span
                  className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400"
                  title="You moved your invalidation further from price — the level that was supposed to prove you wrong"
                >
                  <AlertTriangle className="h-3 w-3" /> stop widened
                </span>
              )}
            </div>
            <ul className="mt-0.5 space-y-0.5 text-gray-400">
              {r.changes.map((c, j) => (
                <li key={j} className="tabular-nums">{describeChange(c as FieldChange)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
