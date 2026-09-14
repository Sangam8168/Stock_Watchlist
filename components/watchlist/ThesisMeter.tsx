'use client';

import { fmtPrice } from '@/lib/changes/display';

/**
 * A one-glance "where does price sit vs. my plan" bar.
 * Long: invalidation ── entry band ── target, low → high.
 * Short: target ── entry band ── invalidation (the thesis wants price to fall).
 */
export default function ThesisMeter({ entry }: { entry: WatchlistEntry }) {
  const { price, entryLow, entryHigh, invalidationPrice, targetPrice, direction } = entry;
  if (price == null || entryLow == null || entryHigh == null) return null;

  // Confidence decay. A thesis you wrote three months ago and haven't re-read is
  // worth less than one you confirmed yesterday, so let the bar *look* less
  // certain as it ages rather than only flagging it in a column. Full colour for
  // the first fortnight, fading to ~40% saturation by 90 days.
  const age = entry.daysSinceReview ?? 0;
  const decay = Math.min(1, Math.max(0, (age - 14) / 76));
  const confidence = { filter: `saturate(${(1 - decay * 0.6).toFixed(2)})`, opacity: 1 - decay * 0.25 };

  const marks = [price, entryLow, entryHigh, invalidationPrice, targetPrice].filter(
    (v): v is number => typeof v === 'number'
  );
  let lo = Math.min(...marks);
  let hi = Math.max(...marks);
  const pad = (hi - lo || hi || 1) * 0.08;
  lo -= pad;
  hi += pad;
  const span = hi - lo || 1;
  const pct = (v: number) => `${(((v - lo) / span) * 100).toFixed(1)}%`;

  const isShort = direction === 'short';
  const bandLeft = `${(((entryLow - lo) / span) * 100).toFixed(1)}%`;
  const bandWidth = `${(((entryHigh - entryLow) / span) * 100).toFixed(1)}%`;

  // Danger zone = beyond invalidation; profit zone = beyond target.
  const dangerStyle =
    invalidationPrice == null
      ? null
      : isShort
        ? { left: pct(invalidationPrice), right: '0%' }
        : { left: '0%', width: pct(invalidationPrice) };
  const profitStyle =
    targetPrice == null
      ? null
      : isShort
        ? { left: '0%', width: pct(targetPrice) }
        : { left: pct(targetPrice), right: '0%' };

  return (
    <div className="mt-2">
      <div className="relative h-2 w-full rounded-full bg-gray-700 transition-[filter,opacity] duration-500" style={confidence}>
        {dangerStyle && <div className="absolute inset-y-0 rounded-full bg-red-500/40" style={dangerStyle} />}
        {profitStyle && <div className="absolute inset-y-0 rounded-full bg-green-500/40" style={profitStyle} />}
        <div className="absolute inset-y-0 rounded-full bg-yellow-500/70" style={{ left: bandLeft, width: bandWidth }} />
        <div
          className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-gray-100"
          style={{ left: pct(price) }}
          title={`Now ${fmtPrice(price)}`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-600">
        <span>{fmtPrice(lo + pad)}</span>
        <span className="text-gray-400">now {fmtPrice(price)}</span>
        <span>{fmtPrice(hi - pad)}</span>
      </div>
      {age >= 30 && (
        <p className="mt-1 text-[10px] text-amber-500/80" title="Levels you set a while ago may no longer reflect the setup">
          Not reviewed in {age} days — still the right levels?
        </p>
      )}
    </div>
  );
}
