/**
 * The change-detection engine.
 *
 * `detectChanges` is a pure function of (previous snapshot, current snapshot,
 * the user's thesis for that symbol). It has no I/O, no clock of its own unless
 * you pass one, and no database — which is exactly what makes it testable and
 * replayable. Everything the product calls "meaningful" is defined here, and
 * always *relative to the thesis*: entering the entry band you chose, breaking
 * the level that would prove you wrong, a move that's large for this particular
 * stock's own volatility — not a fixed percentage.
 *
 * Keep the `ChangeKind` union in sync with CHANGE_TYPES in
 * database/models/changeEvent.model.ts.
 */

export type ChangeKind =
  | 'entered_entry_zone'
  | 'invalidation_breached'
  | 'target_reached'
  | 'abnormal_move'
  | 'catalyst_imminent'
  | 'earnings_reported'
  | 'news_break'
  | 'new_52w_high'
  | 'new_52w_low'
  | 'valuation_shift'
  | 'corporate_action'
  | 'stale_data';

export interface SnapshotLike {
  symbol?: string;
  asOf?: Date | string;
  stale?: boolean;
  price?: number;
  changePercent?: number;
  week52High?: number;
  week52Low?: number;
  peRatio?: number;
  marketCap?: number;
  nextEarningsDate?: Date | string | null;
  newsHash?: string;
  newsCount?: number;
  topHeadline?: string;
}

export interface ThesisLike {
  symbol: string;
  company?: string;
  category?: string;
  entryLow?: number;
  entryHigh?: number;
  invalidationPrice?: number;
  targetPrice?: number;
  /** 'long' (default): invalidation is below, target above. 'short': the reverse. */
  direction?: 'long' | 'short';
  catalystDate?: Date | string | null;
  catalystNote?: string;
  notify?: boolean;
}

export interface VolatilityStats {
  /** mean of |daily % change| over the trailing window */
  meanAbsChangePct: number;
  /** stdev of daily % change over the trailing window */
  stdevChangePct: number;
  samples: number;
}

export interface DetectOptions {
  volatility?: VolatilityStats | null;
  now?: Date;
  /** true only during regular US market hours — gates intraday-move alerts */
  marketOpen?: boolean;
  /** trading days until `target`; injected so the engine stays free of calendar I/O */
  tradingDaysUntil?: (target: Date | string | null | undefined) => number | null;
}

export interface DetectedChange {
  type: ChangeKind;
  severity: number; // 0–100
  title: string;
  detail: string;
  data: Record<string, unknown>;
  dedupeKey: string;
}

const ABNORMAL_MOVE_FLOOR_PCT = 5; // never flag a move smaller than this, however quiet the stock
const VALUATION_SHIFT_PCT = 15;
const NEWS_MIN_EXTRA_ARTICLES = 1;

function dayKey(d: Date | string | undefined): string {
  const date = d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return 'na';
  return date.toISOString().slice(0, 10);
}

function isoDay(d: Date | string | null | undefined): string {
  if (!d) return 'na';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? 'na' : date.toISOString().slice(0, 10);
}

function clampSeverity(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fmt(n: number | undefined, digits = 2): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—';
}

/** Abnormal-move threshold for this stock: max(5%, mean + 2·stdev of its own daily changes). */
export function abnormalMoveThreshold(vol?: VolatilityStats | null): number {
  if (!vol || vol.samples < 5 || !Number.isFinite(vol.stdevChangePct)) return ABNORMAL_MOVE_FLOOR_PCT;
  return Math.max(ABNORMAL_MOVE_FLOOR_PCT, vol.meanAbsChangePct + 2 * vol.stdevChangePct);
}

export function detectChanges(
  prev: SnapshotLike | null,
  next: SnapshotLike,
  item: ThesisLike,
  opts: DetectOptions = {}
): DetectedChange[] {
  const out: DetectedChange[] = [];
  const now = opts.now ?? new Date();
  const symbol = item.symbol;
  const name = item.company || symbol;
  const price = next.price;
  const prevPrice = prev?.price;

  // --- Suspected corporate action (split, reverse-split, reclassification) ----
  // A stored price is not split-adjusted; the new feed is. So a 10:1 split makes
  // price look like it fell 90% overnight, which would wrongly fire invalidation,
  // abnormal-move and 52-week-low. When the gap is implausibly large or lands on
  // a round split ratio, we suppress price-derived signals and flag it instead.
  let suspectedCorpAction = false;
  if (typeof price === 'number' && typeof prevPrice === 'number' && prevPrice > 0 && price > 0) {
    const ratio = price / prevPrice;
    const roundSplit = [2, 3, 4, 5, 6, 7, 8, 10, 15, 20].some(
      (k) => Math.abs(ratio - k) / k < 0.04 || Math.abs(ratio - 1 / k) * k < 0.04
    );
    if (roundSplit || Math.abs(ratio - 1) > 0.6) {
      suspectedCorpAction = true;
      out.push({
        type: 'corporate_action',
        severity: 45,
        title: `${symbol}: price changed sharply — check for a split`,
        detail: `${name} went from $${fmt(prevPrice)} to $${fmt(price)} between checks. That usually means a stock split or share-class change, not a real move. Re-check your entry / invalidation / target levels.`,
        data: { from: prevPrice, to: price, ratio: Number(ratio.toFixed(3)) },
        dedupeKey: `corporate_action:${symbol}:${dayKey(next.asOf)}`,
      });
    }
  }

  // --- Thesis level crossings --------------------------------------------------
  // A crossing needs a prior price to cross *from*. The first time we observe a
  // symbol we record a baseline, not an event — otherwise a stock that's already
  // in your entry band would fire "just entered" the moment you add it.
  if (typeof price === 'number' && typeof prevPrice === 'number' && !suspectedCorpAction) {
    const { entryLow, entryHigh, invalidationPrice, targetPrice } = item;
    const isShort = item.direction === 'short';

    // Entered the entry band (was outside, now inside). Same for long and short.
    if (typeof entryLow === 'number' && typeof entryHigh === 'number' && entryHigh >= entryLow) {
      const inNow = price >= entryLow && price <= entryHigh;
      const wasIn = prevPrice >= entryLow && prevPrice <= entryHigh;
      if (inNow && !wasIn) {
        out.push({
          type: 'entered_entry_zone',
          severity: 80,
          title: `${symbol} entered your entry zone`,
          detail: `${name} is trading at $${fmt(price)}, inside the $${fmt(entryLow)}–$${fmt(entryHigh)} band you were waiting for.`,
          data: { price, entryLow, entryHigh },
          dedupeKey: `entered_entry_zone:${symbol}:${dayKey(next.asOf)}`,
        });
      }
    }

    // Broke the invalidation level. Long: price falls through it. Short: price rises through it.
    if (typeof invalidationPrice === 'number') {
      const brokeNow = isShort ? price > invalidationPrice : price < invalidationPrice;
      const wasOk = isShort ? prevPrice <= invalidationPrice : prevPrice >= invalidationPrice;
      if (brokeNow && wasOk) {
        out.push({
          type: 'invalidation_breached',
          severity: 95,
          title: `${symbol} broke your invalidation level`,
          detail: `${name} ${isShort ? 'rose to' : 'fell to'} $${fmt(price)}, ${isShort ? 'above' : 'below'} the $${fmt(invalidationPrice)} level you set as "thesis is wrong". Time to decide whether it stays on the list.`,
          data: { price, invalidationPrice, direction: isShort ? 'short' : 'long' },
          dedupeKey: `invalidation_breached:${symbol}:${dayKey(next.asOf)}`,
        });
      }
    }

    // Reached the target. Long: crossed up through it. Short: crossed down through it.
    if (typeof targetPrice === 'number') {
      const hitNow = isShort ? price <= targetPrice : price >= targetPrice;
      const wasAway = isShort ? prevPrice > targetPrice : prevPrice < targetPrice;
      if (hitNow && wasAway) {
        out.push({
          type: 'target_reached',
          severity: 85,
          title: `${symbol} reached your target`,
          detail: `${name} hit $${fmt(price)}, ${isShort ? 'at or below' : 'at or above'} your $${fmt(targetPrice)} target.`,
          data: { price, targetPrice, direction: isShort ? 'short' : 'long' },
          dedupeKey: `target_reached:${symbol}:${dayKey(next.asOf)}`,
        });
      }
    }
  }

  // --- Abnormal intraday move (relative to this stock's own volatility) -------
  if (
    opts.marketOpen &&
    !next.stale &&
    !suspectedCorpAction &&
    typeof next.changePercent === 'number' &&
    Number.isFinite(next.changePercent)
  ) {
    const threshold = abnormalMoveThreshold(opts.volatility);
    const move = Math.abs(next.changePercent);
    if (move >= threshold) {
      const dir = next.changePercent > 0 ? 'up' : 'down';
      const vsVol = opts.volatility && opts.volatility.samples >= 5
        ? ` That's roughly ${fmt(move / Math.max(opts.volatility.stdevChangePct, 0.01), 1)}× its typical daily swing.`
        : '';
      out.push({
        type: 'abnormal_move',
        severity: clampSeverity(45 + Math.min(35, (move - threshold) * 3)),
        title: `${symbol} moved ${dir} ${fmt(move)}% today`,
        detail: `${name} is ${dir} ${fmt(move)}% at $${fmt(next.price)} — large for this stock.${vsVol} Often means news you haven't seen yet.`,
        data: { changePercent: next.changePercent, threshold, price: next.price },
        dedupeKey: `abnormal_move:${symbol}:${dayKey(next.asOf)}`,
      });
    }
  }

  // --- Catalyst approaching --------------------------------------------------
  const catalystSources: Array<{ date: Date | string | null | undefined; label: string }> = [
    { date: item.catalystDate, label: item.catalystNote || 'your catalyst' },
    { date: next.nextEarningsDate, label: 'earnings' },
  ];
  for (const src of catalystSources) {
    if (!src.date) continue;
    const days = opts.tradingDaysUntil ? opts.tradingDaysUntil(src.date) : null;
    if (days !== null && days >= 0 && days <= 5) {
      out.push({
        type: 'catalyst_imminent',
        severity: clampSeverity(55 + (5 - days) * 3),
        title: `${symbol}: ${src.label} in ${days === 0 ? 'under a day' : `${days} trading day${days === 1 ? '' : 's'}`}`,
        detail: `${name} has ${src.label} on ${isoDay(src.date)}. Decide now whether you want a position into it.`,
        data: { catalystDate: isoDay(src.date), tradingDaysUntil: days, label: src.label },
        dedupeKey: `catalyst_imminent:${symbol}:${src.label}:${isoDay(src.date)}`,
      });
    }
  }

  // --- Earnings just reported (the known date rolled forward / into the past) --
  if (prev?.nextEarningsDate && next.nextEarningsDate) {
    const prevIso = isoDay(prev.nextEarningsDate);
    const nextIso = isoDay(next.nextEarningsDate);
    const prevInPast = new Date(prev.nextEarningsDate).getTime() < now.getTime();
    if (prevIso !== 'na' && nextIso !== 'na' && nextIso > prevIso && prevInPast) {
      out.push({
        type: 'earnings_reported',
        severity: 70,
        title: `${symbol} reported earnings`,
        detail: `${name}'s ${prevIso} report is out; the next one is now ${nextIso}. Post-earnings reactions are usually the most actionable setups.`,
        data: { reportedDate: prevIso, nextEarningsDate: nextIso },
        dedupeKey: `earnings_reported:${symbol}:${prevIso}`,
      });
    }
  }

  // --- News break -----------------------------------------------------------
  if (
    prev &&
    typeof next.newsHash === 'string' &&
    next.newsHash.length > 0 &&
    next.newsHash !== prev.newsHash
  ) {
    const rawExtra = (next.newsCount ?? 0) - (prev.newsCount ?? 0);
    // A jump of dozens is a baseline catching up, not a news burst — don't quote a number.
    const extra = Math.min(rawExtra, 12);
    if (rawExtra >= NEWS_MIN_EXTRA_ARTICLES) {
      const countPhrase = rawExtra > 12 ? 'Fresh coverage' : `${rawExtra} new article${rawExtra === 1 ? '' : 's'}`;
      out.push({
        type: 'news_break',
        severity: clampSeverity(30 + Math.min(25, extra * 4)),
        title: `New coverage on ${symbol}`,
        detail: next.topHeadline
          ? `Latest: "${next.topHeadline}" (${countPhrase.toLowerCase()} since you last checked).`
          : `${countPhrase} on ${name} since you last checked.`,
        data: { newsCount: next.newsCount, added: rawExtra, topHeadline: next.topHeadline },
        dedupeKey: `news_break:${symbol}:${next.newsHash}`,
      });
    }
  }

  // --- 52-week range breaks -----------------------------------------------
  if (typeof price === 'number' && typeof prevPrice === 'number' && !suspectedCorpAction) {
    if (typeof next.week52High === 'number' && price >= next.week52High * 0.999 && prevPrice < (prev?.week52High ?? Infinity) * 0.999) {
      out.push({
        type: 'new_52w_high',
        severity: 50,
        title: `${symbol} at a 52-week high`,
        detail: `${name} printed a new 52-week high around $${fmt(price)}.`,
        data: { price, week52High: next.week52High },
        dedupeKey: `new_52w_high:${symbol}:${dayKey(next.asOf)}`,
      });
    }
    if (typeof next.week52Low === 'number' && price <= next.week52Low * 1.001 && prevPrice > (prev?.week52Low ?? 0) * 1.001) {
      out.push({
        type: 'new_52w_low',
        severity: 52,
        title: `${symbol} at a 52-week low`,
        detail: `${name} printed a new 52-week low around $${fmt(price)}. Value or value trap?`,
        data: { price, week52Low: next.week52Low },
        dedupeKey: `new_52w_low:${symbol}:${dayKey(next.asOf)}`,
      });
    }
  }

  // --- Valuation shift ----------------------------------------------------
  // Guard against data artifacts: a P/E that triples-and-then-some between checks
  // is almost always a restated-earnings / metric-source change, not the market
  // re-rating the stock. Only fire on a believable move between sane P/E levels.
  if (
    prev &&
    typeof prev.peRatio === 'number' &&
    typeof next.peRatio === 'number' &&
    prev.peRatio > 0 &&
    next.peRatio > 0 &&
    prev.peRatio < 250 &&
    next.peRatio < 250
  ) {
    const pct = ((next.peRatio - prev.peRatio) / prev.peRatio) * 100;
    if (Math.abs(pct) >= VALUATION_SHIFT_PCT && Math.abs(pct) <= 150) {
      const dir = pct > 0 ? 'expanded' : 'compressed';
      out.push({
        type: 'valuation_shift',
        severity: 40,
        title: `${symbol} valuation ${dir}`,
        detail: `${name}'s P/E ${dir} ${fmt(Math.abs(pct), 0)}% (${fmt(prev.peRatio, 1)} → ${fmt(next.peRatio, 1)}) since you last checked.`,
        data: { from: prev.peRatio, to: next.peRatio, pct },
        dedupeKey: `valuation_shift:${symbol}:${dayKey(next.asOf)}`,
      });
    }
  }

  // --- Data quality -----------------------------------------------------
  if (next.stale) {
    out.push({
      type: 'stale_data',
      severity: 15,
      title: `${symbol} data is delayed`,
      detail: `The latest quote for ${name} is older than expected for the current market state. Figures shown may lag.`,
      data: { asOf: isoDay(next.asOf) },
      dedupeKey: `stale_data:${symbol}:${dayKey(next.asOf)}`,
    });
  }

  return out;
}

/** Rolling volatility stats from a series of daily % changes (newest or oldest order both fine). */
export function volatilityFromChanges(changePcts: number[]): VolatilityStats {
  const xs = changePcts.filter((n) => typeof n === 'number' && Number.isFinite(n));
  const n = xs.length;
  if (n === 0) return { meanAbsChangePct: 0, stdevChangePct: 0, samples: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const meanAbs = xs.reduce((a, b) => a + Math.abs(b), 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { meanAbsChangePct: meanAbs, stdevChangePct: Math.sqrt(variance), samples: n };
}
