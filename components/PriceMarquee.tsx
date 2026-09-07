'use client';

// Infinitely-scrolling ticker strip driven by real quotes fetched on the server.
// Pauses on hover so you can actually read a row.

import type { PulseQuote } from '@/lib/actions/market-pulse.actions';

export default function PriceMarquee({ quotes }: { quotes: PulseQuote[] }) {
  if (!quotes.length) return null;

  const items = [...quotes, ...quotes]; // duplicated for a seamless loop

  return (
    <div className="marquee-mask group w-full overflow-hidden border-y border-gray-800 bg-gray-900/80">
      <div className="animate-marquee py-2 group-hover:[animation-play-state:paused]">
        {items.map((q, i) => {
          const up = q.changePercent >= 0;
          return (
            <span key={i} className="mx-5 inline-flex items-center gap-2 whitespace-nowrap text-sm">
              <span className="font-semibold text-gray-200">{q.symbol}</span>
              <span className="tabular-nums text-gray-400">{q.price.toFixed(2)}</span>
              <span className={`tabular-nums ${up ? 'text-green-500' : 'text-red-500'}`}>
                {up ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
