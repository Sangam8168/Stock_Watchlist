// Why is this at the top of my list?
//
// Borrowed from a competing submission — the good idea being that a ranking
// nobody can interrogate is a ranking nobody should trust. Their version breaks
// a weighted sum into its terms. This one cannot do that, because the score here
// is not a weighted sum of market signals, and pretending otherwise would be a
// nicer-looking lie.
//
// What actually drives the number is: what kind of event it is, whether it
// concerns a level *you* set or the stock itself, and — for the few computed
// scores — how far past its own threshold the move went. So that is what this
// returns. Every branch reconstructs the real arithmetic from the event's own
// stored data, so the explanation cannot drift away from the score it explains.

export type EventScope = 'thesis' | 'symbol' | 'data';

export interface SeverityFactor {
  label: string;
  /** Points contributed. Negative is possible in principle; today nothing subtracts. */
  points: number;
  note: string;
}

export interface SeverityExplanation {
  total: number;
  scope: EventScope;
  headline: string;
  factors: SeverityFactor[];
}

/**
 * Which half of the engine produced this.
 *
 * Not cosmetic: it is the architectural split the whole system rests on.
 * Symbol-scoped events are computed once and shared by every watcher;
 * thesis-scoped ones are computed per user, only for users who set a level.
 */
const THESIS_SCOPED = new Set([
  'entered_entry_zone',
  'invalidation_breached',
  'target_reached',
  'catalyst_imminent',
  'thesis_stale',
]);
const DATA_SCOPED = new Set(['stale_data', 'corporate_action']);

export function scopeOf(type: string): EventScope {
  if (THESIS_SCOPED.has(type)) return 'thesis';
  if (DATA_SCOPED.has(type)) return 'data';
  return 'symbol';
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Base score per event type, and the reason it sits where it does. */
const BASE: Record<string, { points: number; note: string }> = {
  invalidation_breached: { points: 95, note: 'you named this exact price as the one that would prove you wrong' },
  target_reached: { points: 85, note: 'the price you were playing for' },
  entered_entry_zone: { points: 80, note: 'the band you said you would buy in' },
  earnings_reported: { points: 70, note: 'results are the fact a thesis is usually built on' },
  new_52w_low: { points: 52, note: 'a year-long floor gave way' },
  new_52w_high: { points: 50, note: 'a year-long ceiling gave way' },
  corporate_action: { points: 45, note: 'the share count changed, so every price before today means something different' },
  valuation_shift: { points: 40, note: 'the multiple re-rated without a matching price move' },

  approaching_52w_low: { points: 38, note: 'a heads-up while you can still act, not a fact' },
  approaching_52w_high: { points: 35, note: 'a heads-up while you can still act, not a fact' },
  thesis_stale: { points: 15, note: 'nothing happened — you simply have not re-read this in a while' },
};

export function explainSeverity(event: {
  type: string;
  severity: number;
  data?: Record<string, unknown>;
}): SeverityExplanation {
  const scope = scopeOf(event.type);
  const d = event.data ?? {};
  const factors: SeverityFactor[] = [];

  // The three computed scores reconstruct their own arithmetic from stored data,
  // so an explanation can never quietly disagree with the number beside it.
  if (event.type === 'abnormal_move') {
    const move = Math.abs(num(d.changePercent) ?? 0);
    const threshold = num(d.threshold) ?? 0;
    const over = Math.max(0, move - threshold);
    factors.push({
      label: 'Unusual for this stock',
      points: 45,
      note: `${threshold.toFixed(1)}% would be a normal day here — this is ${move.toFixed(1)}%`,
    });
    if (over > 0) {
      factors.push({
        label: 'How far past normal',
        points: Math.min(35, over * 3),
        note: `${over.toFixed(1)} points beyond its own threshold, capped at 35`,
      });
    }
  } else if (event.type === 'catalyst_imminent') {
    const days = num(d.tradingDays) ?? num(d.days) ?? 0;
    factors.push({ label: 'A date you set is close', points: 55, note: 'you flagged this date yourself' });
    if (days < 5) {
      factors.push({
        label: 'How close',
        points: (5 - days) * 3,
        note: `${days} trading day${days === 1 ? '' : 's'} away — the nearer it is, the louder`,
      });
    }
  } else if (event.type === 'news_break') {
    // 30 + min(25, added * 4), where `added` is the new-article count the
    // detector capped at 12 before scoring.
    const added = num(d.added) ?? 0;
    const counted = Math.min(added, 12);
    factors.push({ label: 'Fresh coverage appeared', points: 30, note: 'news the engine had not seen before' });
    if (counted > 0) {
      factors.push({
        label: 'How much of it',
        points: Math.min(25, counted * 4),
        note: `${added} new article${added === 1 ? '' : 's'}, counted up to 12 and capped at 25`,
      });
    }
  } else {
    const base = BASE[event.type];
    factors.push(
      base
        ? { label: 'What happened', points: base.points, note: base.note }
        : { label: 'What happened', points: event.severity, note: 'fixed weight for this kind of event' }
    );
  }

  const headline =
    scope === 'thesis'
      ? 'Ranked on a level you set yourself'
      : scope === 'data'
        ? 'Ranked as a data problem — never filtered out, whatever your alert settings'
        : "Ranked against this stock's own normal behaviour, not a fixed percentage";

  return { total: event.severity, scope, headline, factors };
}
