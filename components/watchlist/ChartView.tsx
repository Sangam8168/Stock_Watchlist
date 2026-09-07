'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TradingViewWidget from '@/components/TradingViewWidget';
import { CANDLE_CHART_WIDGET_CONFIG } from '@/lib/constants';
import { fmtPrice, fmtPct, severityTier, TIER_META } from '@/lib/changes/display';

/**
 * Chart-first layout: one big candlestick chart with the watchlist as a compact
 * sidebar. Clicking a row swaps the chart — the fast way to flip through 40 names.
 */
export default function ChartView({ entries, onBack }: { entries: WatchlistEntry[]; onBack: () => void }) {
  const [active, setActive] = useState(entries[0]?.symbol ?? '');
  const current = entries.find((e) => e.symbol === active) ?? entries[0];

  if (!entries.length) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="order-2 lg:order-1">
        {current && (
          <TradingViewWidget
            key={current.symbol}
            scriptUrl="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
            config={CANDLE_CHART_WIDGET_CONFIG(current.symbol)}
            className="custom-chart"
            height={620}
          />
        )}
      </div>

      <aside className="order-1 lg:order-2">
        <div className="rounded-lg border border-gray-700 bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2.5">
            <span className="text-sm font-semibold text-gray-200">Watchlist</span>
            <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-yellow-500">
              <ArrowLeft className="h-3 w-3" /> Back to list
            </button>
          </div>

          <div className="max-h-[560px] overflow-y-auto scrollbar-hide-default">
            {entries.map((e) => {
              const tier = e.unseenCount > 0 && !e.mutedUntil ? severityTier(e.topUnseenSeverity) : null;
              const on = e.symbol === active;
              return (
                <button
                  key={e.symbol}
                  onClick={() => setActive(e.symbol)}
                  className={`flex w-full items-center justify-between gap-2 border-b border-gray-800 px-3 py-2.5 text-left last:border-0 transition-colors ${
                    on ? 'bg-gray-700/70' : 'hover:bg-gray-700/40'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      {tier && <span className={`h-1.5 w-1.5 rounded-full ${TIER_META[tier].dot}`} />}
                      <span className={`text-sm font-semibold ${on ? 'text-yellow-500' : 'text-gray-100'}`}>{e.symbol}</span>
                    </span>
                    <span className="block truncate text-xs text-gray-600">{e.company}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm tabular-nums text-gray-100">{fmtPrice(e.price)}</span>
                    <span
                      className={`block text-xs tabular-nums ${
                        e.changePercent == null ? 'text-gray-500' : e.changePercent >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {fmtPct(e.changePercent)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {current && (
          <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Your thesis</p>
            <p className="mt-1 text-sm text-gray-300">
              {current.thesis || <span className="italic text-gray-600">None set</span>}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              {current.entryLow != null && current.entryHigh != null && (
                <span>entry {fmtPrice(current.entryLow)}–{fmtPrice(current.entryHigh)}</span>
              )}
              {current.invalidationPrice != null && <span>invalidation {fmtPrice(current.invalidationPrice)}</span>}
              {current.targetPrice != null && <span>target {fmtPrice(current.targetPrice)}</span>}
            </div>
            <Link href={`/stocks/${current.symbol}`} className="mt-2 inline-block text-xs text-yellow-500 hover:underline">
              Open {current.symbol} detail →
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
