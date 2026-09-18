'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Sparkline from '@/components/watchlist/Sparkline';
import { fmtPrice, fmtPct, currencyOf } from '@/lib/changes/display';

/**
 * Hover card for a ticker: enough to decide whether to open the full page,
 * without leaving the table.
 *
 * Everything here comes from data the row already holds, so hovering costs no
 * request — which is what makes it safe to attach to every symbol in a list.
 */
export default function SymbolPreview({
  entry,
  children,
}: {
  entry: WatchlistEntry;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ccy = currencyOf(entry.symbol, entry.currency);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A short delay stops the card flashing as the pointer crosses a column.
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 350);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  const { week52High: hi, week52Low: lo, price } = entry;
  const inRange = hi != null && lo != null && price != null && hi > lo
    ? ((price - lo) / (hi - lo)) * 100
    : null;

  return (
    <span className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      {children}

      {open && (
        <span
          className="surface absolute left-0 top-full z-40 mt-1 block w-72 cursor-default text-left shadow-2xl"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-gray-100">{entry.symbol}</span>
            <span className="truncate text-xs text-gray-500">{entry.company}</span>
          </span>

          {entry.thesis && (
            <span className="mt-1.5 block text-xs leading-relaxed text-gray-400 line-clamp-2">{entry.thesis}</span>
          )}

          {entry.priceHistory.length > 1 && (
            <span className="mt-3 block">
              <Sparkline data={entry.priceHistory} width={256} height={40} />
              {hi != null && lo != null && (
                <span className="mt-1 flex justify-between text-[10px] tabular-nums text-gray-600">
                  <span>52w low {fmtPrice(lo, ccy)}</span>
                  {inRange != null && <span className="text-gray-500">{inRange.toFixed(0)}% of range</span>}
                  <span>high {fmtPrice(hi, ccy)}</span>
                </span>
              )}
            </span>
          )}

          <span className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]">
            <Metric label="Last" value={fmtPrice(price, ccy)} />
            <Metric label="1M" value={entry.return1M != null ? fmtPct(entry.return1M) : '—'} tone={entry.return1M} />
            <Metric label="1Y" value={entry.return1Y != null ? fmtPct(entry.return1Y) : '—'} tone={entry.return1Y} />
            <Metric label="Div yield" value={entry.dividendYield != null ? `${entry.dividendYield.toFixed(2)}%` : '—'} />
            <Metric label="P/E" value={entry.peRatio != null ? entry.peRatio.toFixed(1) : '—'} />
            <Metric label="Beta" value={entry.beta != null ? entry.beta.toFixed(2) : '—'} />
          </span>

          <Link
            href={`/stocks/${entry.symbol}`}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-md bg-white/5 py-2 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-gray-100"
          >
            View details <ArrowRight className="h-3 w-3" />
          </Link>
        </span>
      )}
    </span>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  const color = tone == null ? 'text-gray-200' : tone >= 0 ? 'text-green-500' : 'text-red-500';
  return (
    <span className="block">
      <span className="block text-gray-600">{label}</span>
      <span className={`block tabular-nums ${color}`}>{value}</span>
    </span>
  );
}
