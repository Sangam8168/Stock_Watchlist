'use client';

import { useMemo, useState } from 'react';
import type { MarketPulse } from '@/lib/actions/market-pulse.actions';

/**
 * The market card on the auth screens. Every number here is real: live quotes
 * from the provider, and a price line built from snapshots this app actually
 * captured. When there's nothing to show it says so rather than inventing a
 * line — the product's whole claim is that it's honest about its data.
 *
 * Interactive: pick a symbol, hover/drag the line to scrub to a point.
 */
const W = 560;
const H = 240;
const PAD_Y = 18;

export default function AnimatedChart({ pulse }: { pulse: MarketPulse }) {
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const chart = pulse.charts[active];

  const geom = useMemo(() => {
    if (!chart || chart.series.length < 2) return null;
    const s = chart.series;
    const min = Math.min(...s);
    const max = Math.max(...s);
    const span = max - min || 1;
    const pts = s.map((v, i) => {
      const x = (i / (s.length - 1)) * W;
      const y = H - ((v - min) / span) * (H - PAD_Y * 2) - PAD_Y;
      return [x, y] as const;
    });
    return {
      pts,
      min,
      max,
      line: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
      area: `${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${W},${H} L0,${H} Z`,
    };
  }, [chart]);

  // No provider at all — say so plainly.
  if (pulse.source === 'unavailable') {
    return (
      <div className="w-full max-w-[560px] rounded-2xl border border-gray-700/60 bg-gray-800/40 p-6 backdrop-blur">
        <p className="text-sm font-medium text-gray-300">Market data unavailable</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          We&rsquo;d rather show nothing than draw a chart that isn&rsquo;t real. Prices return as soon as the
          data provider does.
        </p>
      </div>
    );
  }

  // Quotes are real, but we haven't captured enough movement to draw a line yet
  // (a fresh install, or a closed weekend where every poll returns the same
  // close). Show the real board instead of inventing a shape.
  if (!chart || !geom) {
    return (
      <div className="w-full max-w-[560px] rounded-2xl border border-gray-700/60 bg-gray-800/40 p-5 backdrop-blur">
        <div className="mb-4 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${pulse.marketState === 'Market open' ? 'bg-green-500 animate-pulse-dot' : 'bg-gray-500'}`} />
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{pulse.marketState}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {pulse.quotes.slice(0, 9).map((q, i) => {
            const qUp = q.changePercent >= 0;
            return (
              <div
                key={q.symbol}
                className="auth-beat rounded-lg bg-gray-900/50 p-3 transition-transform hover:-translate-y-0.5"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div className="text-xs font-semibold text-gray-200">{q.symbol}</div>
                <div className="mt-0.5 text-sm tabular-nums text-gray-100">${q.price.toFixed(2)}</div>
                <div className={`text-[11px] tabular-nums ${qUp ? 'text-green-500' : 'text-red-500'}`}>
                  {qUp ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-gray-600">
          Price history builds as the poll runs — we chart captured data, never a generated line.
        </p>
      </div>
    );
  }

  const up = chart.changePercent >= 0;
  const stroke = up ? '#22c55e' : '#ef4444';
  const idx = hover ?? geom.pts.length - 1;
  const [hx, hy] = geom.pts[idx];
  const shownPrice = chart.series[idx];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    const i = Math.round(ratio * (geom.pts.length - 1));
    setHover(Math.max(0, Math.min(geom.pts.length - 1, i)));
  };

  return (
    <div className="w-full max-w-[560px] rounded-2xl border border-gray-700/60 bg-gray-800/40 p-5 backdrop-blur transition-colors hover:border-gray-600">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${pulse.marketState === 'Market open' ? 'bg-green-500 animate-pulse-dot' : 'bg-gray-500'}`} />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{pulse.marketState}</span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            {hover != null ? 'Scrubbing history' : 'Last close'} · {chart.series.length} real data points
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-gray-100">
            ${shownPrice.toFixed(2)}
          </div>
          <div className={`text-xs font-medium tabular-nums ${up ? 'text-green-500' : 'text-red-500'}`}>
            {up ? '▲' : '▼'} {Math.abs(chart.changePercent).toFixed(2)}% today
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto cursor-crosshair touch-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="ac-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#2A2A2A" strokeWidth="1" />
        ))}

        <path d={geom.area} fill="url(#ac-fill)" className="animate-draw-fade" />
        <path
          d={geom.line}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="animate-draw-line"
          style={{ transition: 'stroke .4s ease' }}
        />

        {hover != null && <line x1={hx} x2={hx} y1="0" y2={H} stroke="#4b5563" strokeWidth="1" strokeDasharray="3 3" />}
        <circle cx={hx} cy={hy} r="9" fill={stroke} opacity="0.18" className={hover == null ? 'animate-pulse-dot' : ''} />
        <circle cx={hx} cy={hy} r="4" fill={stroke} />
      </svg>

      {/* Switching the symbol switches the line — the chips aren't decoration. */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {pulse.charts.map((c, i) => {
          const cUp = c.changePercent >= 0;
          return (
            <button
              key={c.symbol}
              type="button"
              onClick={() => { setActive(i); setHover(null); }}
              className={`rounded-lg py-2 text-center transition-all ${
                i === active
                  ? 'bg-gray-700/80 ring-1 ring-yellow-500/40'
                  : 'bg-gray-900/50 hover:bg-gray-900/90 hover:-translate-y-0.5'
              }`}
            >
              <div className="text-xs font-semibold text-gray-200">{c.symbol}</div>
              <div className={`text-xs tabular-nums ${cUp ? 'text-green-500' : 'text-red-500'}`}>
                {cUp ? '+' : ''}{c.changePercent.toFixed(2)}%
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
