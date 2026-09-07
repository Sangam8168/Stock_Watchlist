// Client-safe presentation helpers for change events. No server imports.

export type Tier = 'critical' | 'act' | 'review' | 'fyi';

export function severityTier(severity: number): Tier {
  if (severity >= 90) return 'critical';
  if (severity >= 70) return 'act';
  if (severity >= 50) return 'review';
  return 'fyi';
}

export const TIER_META: Record<Tier, { label: string; dot: string; text: string; ring: string }> = {
  critical: { label: 'Invalidated', dot: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/30' },
  act: { label: 'Act', dot: 'bg-amber-500', text: 'text-amber-400', ring: 'ring-amber-500/30' },
  review: { label: 'Review', dot: 'bg-yellow-500', text: 'text-yellow-400', ring: 'ring-yellow-500/30' },
  fyi: { label: 'FYI', dot: 'bg-gray-500', text: 'text-gray-400', ring: 'ring-gray-500/20' },
};

export const CHANGE_TYPE_LABEL: Record<string, string> = {
  entered_entry_zone: 'Entered entry zone',
  invalidation_breached: 'Invalidation breached',
  target_reached: 'Target reached',
  abnormal_move: 'Abnormal move',
  catalyst_imminent: 'Catalyst imminent',
  earnings_reported: 'Earnings reported',
  news_break: 'News break',
  new_52w_high: '52-week high',
  new_52w_low: '52-week low',
  valuation_shift: 'Valuation shift',
  corporate_action: 'Possible split',
  stale_data: 'Data delayed',
  thesis_stale: 'Gone quiet',
};

/**
 * "Organise by valuation status: companies within 10% of your buy price deserve
 * close monitoring; those 50% above your target can be reviewed less often."
 * Bucketed on distance-to-entry so attention follows opportunity.
 */
export type ProximityBucket = 'in-zone' | 'near' | 'watching' | 'far' | 'no-levels';

export const PROXIMITY_META: Record<ProximityBucket, { label: string; cadence: string; order: number }> = {
  'in-zone':   { label: 'In your entry zone', cadence: 'act now', order: 0 },
  near:        { label: 'Within 10% of entry', cadence: 'check daily', order: 1 },
  watching:    { label: '10–25% away',         cadence: 'check weekly', order: 2 },
  far:         { label: 'More than 25% away',  cadence: 'check monthly', order: 3 },
  'no-levels': { label: 'No entry levels set', cadence: 'add levels to prioritise', order: 4 },
};

export function proximityBucket(e: { distanceToEntryPct: number | null }): ProximityBucket {
  const d = e.distanceToEntryPct;
  if (d == null) return 'no-levels';
  const abs = Math.abs(d);
  if (d === 0) return 'in-zone';
  if (abs <= 10) return 'near';
  if (abs <= 25) return 'watching';
  return 'far';
}

export const CATEGORY_META: Record<string, { label: string; cadence: string }> = {
  active: { label: 'Active setups', cadence: 'review daily' },
  developing: { label: 'Developing', cadence: 'review weekly' },
  longterm: { label: 'Long-term holds', cadence: 'review monthly' },
  earnings: { label: 'Earnings watch', cadence: 'review before each report' },
  speculative: { label: 'Speculative', cadence: 'size small' },
};

/** "Tuesday at 09:15" / "6 Sep at 14:02" — an actual moment, not just "3h ago". */
export function whenExactly(iso: string | number | Date): string {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 864e5;
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (days < 1) return `today at ${time}`;
  if (days < 2) return `yesterday at ${time}`;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${time}`;
}

/** Render one side of a was → now delta. */
export function fmtDelta(v: number | null, kind: ValueDelta['kind']): string {
  if (v == null) return '—';
  switch (kind) {
    case 'price': return fmtPrice(v);
    case 'percent': return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    case 'ratio': return v.toFixed(1);
    default: return String(Math.round(v));
  }
}

export function timeAgo(iso: string | number | Date): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function fmtPrice(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function fmtMarketCap(n: number | null | undefined): string {
  if (typeof n !== 'number' || n <= 0) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}
