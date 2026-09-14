// Thesis health: one number for "how is my list actually doing?".
//
// Pure, like the detection engine — it takes already-loaded entries and returns
// a score plus the breakdown behind it. A score with no explanation is a vanity
// metric, so `reasons` is part of the return, not an afterthought.

export type ThesisState =
  | 'broken'      // price went through the level you said would prove you wrong
  | 'at-target'   // reached what you were playing for
  | 'in-zone'     // inside the band you said you'd buy
  | 'approaching' // within 10% of the entry band
  | 'watching'    // has levels, nothing happening
  | 'stale'       // has levels but you haven't re-read it in a month
  | 'unset';      // no levels — nothing can be judged against it

export interface HealthInput {
  symbol: string;
  distanceToEntryPct: number | null;
  invalidationPrice: number | null;
  targetPrice: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  price: number | null;
  direction: 'long' | 'short';
  daysSinceReview: number | null;
  events: { type: string }[];
}

export interface HealthReport {
  /** 0–100. Null when there is nothing to score. */
  score: number | null;
  states: Record<ThesisState, string[]>;
  /** Plain-English lines, most important first. */
  reasons: string[];
  tracked: number;
}

/** How each state moves the score, and how heavily it counts. */
const WEIGHTS: Record<ThesisState, { value: number; weight: number }> = {
  broken:      { value: 0,   weight: 2 },   // double weight: a broken thesis is the loudest signal
  stale:       { value: 35,  weight: 1 },
  unset:       { value: 50,  weight: 0.5 }, // can't be judged, so it barely counts either way
  watching:    { value: 70,  weight: 1 },
  approaching: { value: 85,  weight: 1 },
  'in-zone':   { value: 95,  weight: 1.5 },
  'at-target': { value: 100, weight: 1.5 },
};

const STALE_AFTER_DAYS = 30;

export function classify(e: HealthInput): ThesisState {
  const hasLevels = e.entryLow != null || e.invalidationPrice != null || e.targetPrice != null;
  if (!hasLevels) return 'unset';

  // An unreviewed breach outranks everything else — it needs a decision.
  if (e.events.some((ev) => ev.type === 'invalidation_breached')) return 'broken';

  // Fall back to comparing price against the level directly, so a breach that
  // happened before the app was watching still registers.
  if (e.price != null && e.invalidationPrice != null) {
    const broken = e.direction === 'short' ? e.price > e.invalidationPrice : e.price < e.invalidationPrice;
    if (broken) return 'broken';
  }
  if (e.price != null && e.targetPrice != null) {
    const hit = e.direction === 'short' ? e.price <= e.targetPrice : e.price >= e.targetPrice;
    if (hit) return 'at-target';
  }

  if (e.distanceToEntryPct === 0) return 'in-zone';
  if ((e.daysSinceReview ?? 0) >= STALE_AFTER_DAYS) return 'stale';
  if (e.distanceToEntryPct != null && Math.abs(e.distanceToEntryPct) <= 10) return 'approaching';
  return 'watching';
}

export function thesisHealth(entries: HealthInput[]): HealthReport {
  const states: Record<ThesisState, string[]> = {
    broken: [], 'at-target': [], 'in-zone': [], approaching: [], watching: [], stale: [], unset: [],
  };
  for (const e of entries) states[classify(e)].push(e.symbol);

  if (!entries.length) return { score: null, states, reasons: [], tracked: 0 };

  let weighted = 0;
  let total = 0;
  for (const [state, syms] of Object.entries(states) as [ThesisState, string[]][]) {
    const { value, weight } = WEIGHTS[state];
    weighted += value * weight * syms.length;
    total += weight * syms.length;
  }
  const score = total > 0 ? Math.round(weighted / total) : null;

  // Ordered by what most deserves attention, not by count.
  const reasons: string[] = [];
  const n = (a: string[]) => a.length;
  if (n(states.broken)) reasons.push(`${n(states.broken)} thesis${n(states.broken) === 1 ? '' : 'es'} broken — needs a decision`);
  if (n(states['at-target'])) reasons.push(`${n(states['at-target'])} at target`);
  if (n(states['in-zone'])) reasons.push(`${n(states['in-zone'])} in your entry zone`);
  if (n(states.approaching)) reasons.push(`${n(states.approaching)} within 10% of entry`);
  if (n(states.stale)) reasons.push(`${n(states.stale)} not reviewed in ${STALE_AFTER_DAYS}+ days`);
  if (n(states.unset)) reasons.push(`${n(states.unset)} with no levels set — can't be judged`);

  return { score, states, reasons, tracked: entries.length };
}

/** Label + colour for the score, so every surface reads it the same way. */
export function healthBand(score: number | null): { label: string; text: string; ring: string } {
  if (score == null) return { label: 'No data', text: 'text-gray-500', ring: 'ring-gray-700' };
  if (score >= 80) return { label: 'Healthy', text: 'text-green-500', ring: 'ring-green-500/40' };
  if (score >= 60) return { label: 'Holding up', text: 'text-gray-200', ring: 'ring-gray-600' };
  if (score >= 40) return { label: 'Needs work', text: 'text-amber-400', ring: 'ring-amber-500/40' };
  return { label: 'Under pressure', text: 'text-red-400', ring: 'ring-red-500/40' };
}
