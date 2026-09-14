// Per-item alert preferences — how much noise a given stock is allowed to make.
//
// The architectural constraint that shapes this: symbol-level events
// (abnormal moves, news, 52-week extremes) are computed ONCE and shared by
// everyone watching the ticker. That is what keeps detection O(symbols) rather
// than O(users x symbols), and it is worth protecting.
//
// So preferences cannot change how events are *generated* — they filter at read
// time. Events are produced at the most sensitive threshold, and each user's
// settings decide which of them they actually see. Same shared rows, different
// views.

export type AlertTone = 'signal' | 'all';

export interface AlertPrefs {
  /**
   * Multiplier on this stock's abnormal-move threshold. 1 = the computed
   * volatility-aware default; 2 = "this one is noisy, only tell me about moves
   * twice that size"; 0.5 = "tell me about smaller moves than usual".
   */
  sensitivity: number;
  /**
   * 'signal' — only what relates to levels you set (entry, invalidation,
   * target, your own catalyst). 'all' — also market colour: abnormal moves,
   * news, 52-week extremes, valuation shifts.
   */
  tone: AlertTone;
}

export const DEFAULT_PREFS: AlertPrefs = { sensitivity: 1, tone: 'all' };

export const SENSITIVITY_STEPS = [
  { value: 0.5, label: 'Twitchy', hint: 'Tell me about smaller moves than usual' },
  { value: 1, label: 'Normal', hint: "This stock's own typical volatility" },
  { value: 1.5, label: 'Calm', hint: 'Only clearly outsized moves' },
  { value: 2.5, label: 'Quiet', hint: "It's a noisy stock — only the extremes" },
] as const;

/** Events that always relate to levels the user chose. */
const SIGNAL_TYPES = new Set([
  'entered_entry_zone',
  'invalidation_breached',
  'target_reached',
  'catalyst_imminent',
  'earnings_reported',
  // Data problems are never noise — if the number is wrong you need to know,
  // whatever your tone setting.
  'stale_data',
  'corporate_action',
]);

export interface FilterableEvent {
  type: string;
  data?: Record<string, unknown>;
}

export function clampSensitivity(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 1;
  return Math.min(3, Math.max(0.5, v));
}

/**
 * Should this user see this event for this symbol?
 *
 * Pure so it can be applied identically on the page, in the digest and in the
 * email — three surfaces that must never disagree about what counts as unseen.
 */
export function shouldSurface(event: FilterableEvent, prefs: AlertPrefs = DEFAULT_PREFS): boolean {
  if (prefs.tone === 'signal' && !SIGNAL_TYPES.has(event.type)) return false;

  if (event.type === 'abnormal_move') {
    const move = Math.abs(Number(event.data?.changePercent ?? 0));
    const base = Number(event.data?.threshold ?? 0);
    // Without a recorded threshold we can't scale it, so don't silently drop it.
    if (!Number.isFinite(base) || base <= 0) return true;
    return move >= base * clampSensitivity(prefs.sensitivity);
  }

  return true;
}

export function filterEvents<T extends FilterableEvent>(events: T[], prefs?: AlertPrefs): T[] {
  return events.filter((e) => shouldSurface(e, prefs));
}
