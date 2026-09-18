// Can we honestly say "nothing changed"?
//
// This app's whole promise is "come back and see what changed". Silence is its
// most common answer, and silence has two completely different causes:
//
//   1. nothing happened            → "all quiet" is the truth
//   2. we could not see anything   → "all quiet" is a lie
//
// Case 2 is the dangerous one, because a provider outage, an expired key or a
// rate-limit wall produces no snapshots, therefore no change events, therefore
// an empty digest that renders as a reassuring green tick. The user is told
// everything is fine precisely when the app has gone blind.
//
// Pure, like the rest of the engine: it takes what we hold and returns whether
// the silence can be trusted.

export interface CoverageRow {
  symbol: string;
  /** Newest snapshot we hold for this symbol, or null if we hold none. */
  capturedAt: Date | null;
  /** The provider-side flag: quote missing, or its timestamp lagging badly. */
  stale: boolean;
  /**
   * The exchange has no such listing. Deliberately separate from staleness:
   * "I cannot see this" and "this does not exist any more" call for completely
   * different responses from the reader.
   */
  notFound?: boolean;
}

export interface CoverageReport {
  total: number;
  fresh: number;
  /** We hold something, but it is too old or the provider flagged it. */
  degraded: number;
  /** We hold nothing at all for this symbol. */
  blind: number;
  /** Symbols we cannot currently vouch for, alphabetical for a stable UI. */
  unseen: string[];
  /** Symbols whose ticker no longer exists — actionable, not unknown. */
  delisted: string[];
  /** Oldest capture among the symbols we cannot vouch for. */
  oldestUnseenAt: Date | null;
  /** False when an empty digest must NOT be presented as "nothing happened". */
  canAssertQuiet: boolean;
}

/**
 * Three missed 15-minute polls. Two would fire on a single slow cron run;
 * three means something is actually wrong.
 */
export const OPEN_TOLERANCE_MS = 45 * 60 * 1000;

/**
 * Outside market hours prices legitimately do not move, so the bar is a long
 * weekend rather than minutes. A false "we are blind" warning costs trust just
 * as a false "all quiet" does.
 */
export const CLOSED_TOLERANCE_MS = 96 * 60 * 60 * 1000;

export function assessCoverage(
  rows: CoverageRow[],
  opts: { now: Date; marketOpen: boolean }
): CoverageReport {
  const tolerance = opts.marketOpen ? OPEN_TOLERANCE_MS : CLOSED_TOLERANCE_MS;
  const nowMs = opts.now.getTime();

  let fresh = 0;
  let degraded = 0;
  let blind = 0;
  const unseen: string[] = [];
  const delisted: string[] = [];
  let oldestUnseenAt: Date | null = null;

  for (const r of rows) {
    // A renamed or delisted ticker is a known problem with a known fix, so it
    // is reported on its own rather than counted as blindness. Folding it in
    // would leave "can't confirm" showing forever over something only the user
    // can resolve — and a warning that never clears stops being a warning.
    if (r.notFound) {
      delisted.push(r.symbol);
      continue;
    }
    if (r.capturedAt == null) {
      blind++;
      unseen.push(r.symbol);
      continue;
    }
    // Clock skew between app and database can put a capture slightly ahead of
    // now. That is not staleness, so clamp rather than reporting a negative age.
    const age = Math.max(0, nowMs - r.capturedAt.getTime());
    if (r.stale || age > tolerance) {
      degraded++;
      unseen.push(r.symbol);
      if (!oldestUnseenAt || r.capturedAt < oldestUnseenAt) oldestUnseenAt = r.capturedAt;
      continue;
    }
    fresh++;
  }

  return {
    total: rows.length,
    fresh,
    degraded,
    blind,
    unseen: unseen.sort(),
    delisted: delisted.sort(),
    oldestUnseenAt,
    // An empty list has nothing to be blind about, so silence is honest.
    canAssertQuiet: degraded === 0 && blind === 0,
  };
}
