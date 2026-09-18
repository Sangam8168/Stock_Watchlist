// How concentrated a watchlist is.
//
// Every other number in this app is about one stock. This is about the *shape*
// of the list — the thing you cannot see by looking at rows one at a time, and
// which no data vendor can tell you because the list is yours.
//
// Pure, so it can be tested and reused wherever the list is known.

export interface ConcentrationSlice {
  label: string;
  count: number;
  /** Share of the list by count, 0–100. */
  pct: number;
  /** Share by money at risk, when position sizes are known. */
  valuePct: number | null;
}

export interface Concentration {
  slices: ConcentrationSlice[];
  /** 0–100. Higher = more concentrated. Herfindahl index, rescaled. */
  score: number;
  /** The single biggest exposure, for a one-line summary. */
  top: ConcentrationSlice | null;
  /** Plain-English reading, or null when the list is too small to judge. */
  verdict: string | null;
  tracked: number;
}

export interface ConcentrationInput {
  /** Currency the marketValue is denominated in. Mixed currencies disable value weighting. */
  currency?: string | null;
  sector: string | null;
  marketValue: number | null;
}

const UNKNOWN = 'Uncategorised';

/**
 * Concentration by sector.
 *
 * Weighted by position value when shares are known, and by count otherwise —
 * a list of ten names you haven't sized is still meaningfully concentrated if
 * eight of them are semiconductors.
 */
export function concentration(items: ConcentrationInput[]): Concentration {
  const tracked = items.length;
  if (!tracked) return { slices: [], score: 0, top: null, verdict: null, tracked: 0 };

  // Money is only addable within one currency. A ₹8,208 holding and a $200
  // holding cannot be summed — the rupee figure is ~83x larger for the same
  // real value, so Indian names would swamp the chart and report a
  // concentration that does not exist.
  //
  // Where the list mixes currencies we fall back to weighting by count, which
  // is coarser but true, and the caller already says which mode it is in.
  // Converting first would be the richer answer, but that needs live FX rates
  // and this function stays pure.
  const currencies = new Set(
    items.filter((i) => (i.marketValue ?? 0) > 0).map((i) => i.currency ?? 'USD')
  );
  const valueComparable = currencies.size <= 1;

  const counts = new Map<string, { count: number; value: number }>();
  let totalValue = 0;
  for (const i of items) {
    const key = i.sector?.trim() || UNKNOWN;
    const prev = counts.get(key) ?? { count: 0, value: 0 };
    const v = valueComparable ? (i.marketValue ?? 0) : 0;
    counts.set(key, { count: prev.count + 1, value: prev.value + v });
    totalValue += v;
  }

  const slices: ConcentrationSlice[] = [...counts.entries()]
    .map(([label, { count, value }]) => ({
      label,
      count,
      pct: (count / tracked) * 100,
      valuePct: totalValue > 0 ? (value / totalValue) * 100 : null,
    }))
    .sort((a, b) => (b.valuePct ?? b.pct) - (a.valuePct ?? a.pct));

  // Herfindahl: sum of squared shares. 1/n when perfectly even, 1 when it's all
  // one sector — rescaled so an evenly spread list reads as 0.
  const shares = slices.map((s) => (s.valuePct ?? s.pct) / 100);
  const hhi = shares.reduce((sum, s) => sum + s * s, 0);
  const even = 1 / slices.length;
  const score = slices.length <= 1 ? 100 : Math.round(((hhi - even) / (1 - even)) * 100);

  const top = slices[0] ?? null;

  // Below five names, "concentrated" is not a meaningful judgement — it's just
  // a short list, and saying otherwise would be noise dressed as insight.
  const verdict =
    tracked < 5
      ? null
      : top && (top.valuePct ?? top.pct) >= 50
        ? `Over half your list is ${top.label}. A sector-wide move would hit most of it at once.`
        : score >= 50
          ? 'Fairly concentrated — a handful of sectors dominate.'
          : 'Reasonably spread across sectors.';

  return { slices, score: Math.max(0, Math.min(100, score)), top, verdict, tracked };
}
