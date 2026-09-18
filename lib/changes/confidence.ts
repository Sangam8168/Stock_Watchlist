// How much is a quote worth trusting, and does the provider contradict itself?
//
// Two ideas, both borrowed and both adapted, because copying them directly
// would have meant inventing numbers:
//
// 1. A graded confidence instead of a stale/not-stale boolean. The grade is
//    derived from the polling interval rather than from magic constants — a
//    quote younger than one poll cycle is as fresh as this system is capable of
//    being, so it scores 1.0, and the floor lands on the same "three missed
//    polls" threshold that coverage.ts uses to decide it has gone blind. One
//    policy, two surfaces, rather than two unrelated ladders of numbers.
//
// 2. Cross-source conflict detection, done with one source. The usual version
//    compares two providers and flags divergence. With a single provider that is
//    impossible — but a single provider still contradicts *itself* across
//    endpoints, because the quote and the fundamentals are computed separately
//    and updated on different schedules. A price above the 52-week high it also
//    reports is not a rally, it is two endpoints disagreeing. That really
//    happens: CRWD trades above the 52-week high this app has stored for it.
//
// Pure, and evaluated at read time, so it applies to snapshots already in the
// database rather than waiting for the next write.

export type ConfidenceBand = 'live' | 'delayed' | 'stale' | 'unusable';

export interface ConfidenceInput {
  /** The provider's own timestamp for the quote, if it gave one. */
  asOf: Date | null;
  /** Whether we hold a usable price at all. */
  hasQuote: boolean;
  /** Fields the fetch could not confirm. */
  unconfirmedFields?: string[];
  marketOpen: boolean;
  price?: number | null;
  week52High?: number | null;
  week52Low?: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
}

export interface ConfidenceReport {
  /** 0–1. Deliberately coarse: it reflects policy, not measurement precision. */
  score: number;
  band: ConfidenceBand;
  ageSeconds: number | null;
  /** Plain-English reasons it is not 1.0, most important first. */
  reasons: string[];
  /** Fields where the provider contradicts itself. */
  conflicts: string[];
}

/** The app's own cadence. Nothing can be fresher than one cycle. */
export const POLL_SECONDS = 15 * 60;

/**
 * Where the provider disagrees with itself.
 *
 * Every check is a statement that cannot be true at once, never a judgement
 * about whether a number looks plausible — a surprising-but-consistent quote is
 * news, and suppressing it would be worse than showing it.
 */
export function detectConflicts(i: ConfidenceInput): string[] {
  const out: string[] = [];
  const n = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

  if (n(i.week52High) && n(i.week52Low) && i.week52Low > i.week52High) {
    out.push('52-week low is above the 52-week high');
  }
  if (n(i.price) && n(i.week52High) && i.price > i.week52High) {
    out.push('price is above the 52-week high the provider reports');
  }
  if (n(i.price) && n(i.week52Low) && i.price < i.week52Low) {
    out.push('price is below the 52-week low the provider reports');
  }
  if (n(i.dayHigh) && n(i.dayLow) && i.dayLow > i.dayHigh) {
    out.push("today's low is above today's high");
  }
  if (n(i.price) && n(i.dayHigh) && n(i.dayLow) && (i.price > i.dayHigh || i.price < i.dayLow)) {
    out.push("price sits outside today's own range");
  }
  return out;
}

export function assessConfidence(i: ConfidenceInput, now: Date = new Date()): ConfidenceReport {
  const conflicts = detectConflicts(i);

  if (!i.hasQuote) {
    return {
      score: 0,
      band: 'unusable',
      ageSeconds: null,
      reasons: ['no price returned for this symbol'],
      conflicts,
    };
  }

  // Clock skew can put a provider timestamp slightly ahead of us. That is not
  // freshness from the future; clamp rather than reward it.
  const ageSeconds = i.asOf ? Math.max(0, (now.getTime() - i.asOf.getTime()) / 1000) : null;

  const reasons: string[] = [];
  let score = 1;

  // Age only means something while the market is moving. Outside hours the last
  // print is the correct price, however old it is.
  if (i.marketOpen && ageSeconds != null) {
    const cycles = ageSeconds / POLL_SECONDS;
    if (cycles > 3) {
      score = 0.25;
      reasons.push('no fresh price for more than three polling cycles');
    } else if (cycles > 2) {
      score = 0.5;
      reasons.push('two polling cycles without a fresh price');
    } else if (cycles > 1) {
      score = 0.8;
      reasons.push('one polling cycle missed');
    }
  } else if (i.marketOpen && ageSeconds == null) {
    score = 0.5;
    reasons.push('provider gave no timestamp for this quote');
  }

  // A contradiction is worse than age: an old price is still a price that was
  // once true, while two fields that cannot both be right mean one is wrong now.
  if (conflicts.length) {
    score = Math.min(score, 0.4);
    reasons.push(conflicts[0]);
  }

  const unconfirmed = i.unconfirmedFields ?? [];
  if (unconfirmed.length) {
    // Named, not averaged away — knowing *which* field to distrust is what makes
    // this actionable, and it is the reason we keep the list alongside the score.
    score = Math.min(score, 0.9);
    reasons.push(`${unconfirmed.length} field${unconfirmed.length === 1 ? '' : 's'} could not be confirmed`);
  }

  const band: ConfidenceBand = score >= 0.9 ? 'live' : score >= 0.5 ? 'delayed' : score > 0 ? 'stale' : 'unusable';
  return { score: Math.round(score * 100) / 100, band, ageSeconds, reasons, conflicts };
}

/** Label and tone, so every surface describes the same score identically. */
export function confidenceLabel(band: ConfidenceBand): { label: string; tone: string } {
  switch (band) {
    case 'live': return { label: 'Live', tone: 'text-green-500' };
    case 'delayed': return { label: 'Delayed', tone: 'text-amber-400' };
    case 'stale': return { label: 'Stale', tone: 'text-red-400' };
    default: return { label: 'No data', tone: 'text-gray-500' };
  }
}
