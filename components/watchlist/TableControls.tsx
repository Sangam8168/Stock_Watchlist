'use client';

import { CURRENCIES, type CurrencyCode } from '@/lib/changes/currency';

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';
export const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y'];

/**
 * The three controls that change how the table reads rather than what it holds:
 * which period the change column measures, what currency money is shown in, and
 * whether rows are grouped by sector.
 */
export default function TableControls({
  timeframe, onTimeframe,
  currency, onCurrency,
  groupBySector, onGroupBySector,
  fxAsOf,
}: {
  timeframe: Timeframe;
  onTimeframe: (t: Timeframe) => void;
  currency: CurrencyCode;
  onCurrency: (c: CurrencyCode) => void;
  groupBySector: boolean;
  onGroupBySector: (v: boolean) => void;
  fxAsOf: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      {/* Group by sector */}
      <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
        <span>Group by sector</span>
        <button
          type="button"
          role="switch"
          aria-checked={groupBySector}
          onClick={() => onGroupBySector(!groupBySector)}
          className={`relative h-5 w-9 rounded-full transition-colors ${groupBySector ? 'bg-yellow-500' : 'bg-white/10'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              groupBySector ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </label>

      {/* Currency */}
      <div
        className="flex overflow-hidden rounded-full bg-white/5 p-0.5"
        title={fxAsOf ? `Rates from the ECB, ${fxAsOf}` : 'Live rates unavailable — showing source currency'}
      >
        {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
          <button
            key={c}
            onClick={() => onCurrency(c)}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              currency === c ? 'bg-white text-gray-950' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {CURRENCIES[c].symbol}
          </button>
        ))}
      </div>

      {/* Timeframe — which period the change column measures */}
      <div className="flex overflow-hidden rounded-md border border-white/10">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => onTimeframe(t)}
            title={t === '1D' ? "Today's move" : `Change over the last ${t}`}
            className={`px-2.5 py-1 text-xs transition-colors ${
              timeframe === t ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
