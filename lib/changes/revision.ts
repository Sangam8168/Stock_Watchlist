// The decision trail: how a thesis changed over time.
//
// When a thesis finally breaks, the useful question is rarely "what was the
// price" — it's "what was I thinking, and when did I start moving the goalposts?"
// Quietly widening a stop until it can't be hit is the failure mode this makes
// visible.
//
// Pure diffing here so it can be tested; persistence lives in the action layer.

export interface ThesisFields {
  thesis?: string | null;
  direction?: 'long' | 'short' | null;
  entryLow?: number | null;
  entryHigh?: number | null;
  invalidationPrice?: number | null;
  targetPrice?: number | null;
  catalystDate?: Date | string | null;
  catalystNote?: string | null;
}

export interface FieldChange {
  field: keyof ThesisFields;
  from: string | number | null;
  to: string | number | null;
}

/** Fields whose change represents an actual change of mind. */
const TRACKED: (keyof ThesisFields)[] = [
  'thesis', 'direction', 'entryLow', 'entryHigh',
  'invalidationPrice', 'targetPrice', 'catalystDate', 'catalystNote',
];

const normalise = (v: unknown): string | number | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  // A date-like string collapses to its day, so re-saving an unchanged date
  // doesn't read as an edit.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return s || null;
};

/**
 * What actually changed between two versions of a thesis.
 *
 * Returns an empty array when nothing meaningful moved — every save touches
 * `updatedAt`, but re-saving identical levels is not a decision and must not
 * create a revision, or the trail fills with noise and stops being readable.
 */
export function diffThesis(before: ThesisFields, after: ThesisFields): FieldChange[] {
  const out: FieldChange[] = [];
  for (const field of TRACKED) {
    const a = normalise(before[field]);
    const b = normalise(after[field]);
    if (a !== b) out.push({ field, from: a, to: b });
  }
  return out;
}

const LABELS: Record<keyof ThesisFields, string> = {
  thesis: 'Thesis',
  direction: 'Direction',
  entryLow: 'Entry low',
  entryHigh: 'Entry high',
  invalidationPrice: 'Invalidation',
  targetPrice: 'Target',
  catalystDate: 'Catalyst date',
  catalystNote: 'Catalyst',
};

const money = (v: string | number | null) =>
  v == null ? '—' : typeof v === 'number' ? `$${v}` : `"${v}"`;

/** One human-readable line per change. */
export function describeChange(c: FieldChange): string {
  return `${LABELS[c.field]}: ${money(c.from)} → ${money(c.to)}`;
}

/**
 * Flags the pattern worth warning about: moving an invalidation *away* from
 * price, which converts "I was wrong" into "not yet". Direction-aware, because
 * for a short the dangerous move is upward.
 */
export function isLoosening(c: FieldChange, direction: 'long' | 'short' = 'long'): boolean {
  if (c.field !== 'invalidationPrice') return false;
  if (typeof c.from !== 'number' || typeof c.to !== 'number') return false;
  return direction === 'short' ? c.to > c.from : c.to < c.from;
}
