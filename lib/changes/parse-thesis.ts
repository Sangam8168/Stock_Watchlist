// Turning a rough note into structured levels.
//
// Writing a thesis is the highest-friction part of onboarding and the single
// thing that makes the whole product work, so it should be the easiest. A user
// pastes how they'd actually say it — "thinking NVDA under 130, out if it breaks
// 110, target 160 by earnings" — and we extract entry / invalidation / target.
//
// Split deliberately: `extractThesisLocally` is a pure, tested regex pass that
// handles the common phrasings with no API call, no latency and no key. The LLM
// path is a fallback for prose the patterns miss. Most notes never need it.

export interface ParsedThesis {
  entryLow: number | null;
  entryHigh: number | null;
  invalidationPrice: number | null;
  targetPrice: number | null;
  direction: 'long' | 'short' | null;
  catalystNote: string | null;
  /** Which fields we actually found, for honest UI feedback. */
  found: string[];
}

const EMPTY: ParsedThesis = {
  entryLow: null, entryHigh: null, invalidationPrice: null, targetPrice: null,
  direction: null, catalystNote: null, found: [],
};

/** Accepts "130", "$130", "130.50", "1,305" */
const NUM = String.raw`\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)`;
const toNum = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** A range: "between 120 and 130", "120-130", "120 to 130". */
const RANGE = new RegExp(String.raw`(?:between\s+)?${NUM}\s*(?:-|–|to|and)\s*${NUM}`, 'i');

const PATTERNS = {
  invalidation: [
    new RegExp(String.raw`(?:out|exit|stop|sell|cut|wrong|bail)\b[^.]{0,30}?(?:if|below|under|breaks?|beneath)\s+${NUM}`, 'i'),
    new RegExp(String.raw`(?:stop(?:\s*-?\s*loss)?|invalidat\w*)\s*(?:at|:|of)?\s*${NUM}`, 'i'),
    new RegExp(String.raw`(?:if|once)\s+it\s+(?:breaks?|falls?|drops?)\s+(?:below\s+)?${NUM}`, 'i'),
  ],
  target: [
    new RegExp(String.raw`(?:target|tp|take\s*profit|aiming\s*for|goal|upside\s*to)\s*(?:of|at|:)?\s*${NUM}`, 'i'),
    new RegExp(String.raw`(?:sell|exit|out)\s+(?:at|around)\s+${NUM}`, 'i'),
  ],
  entry: [
    new RegExp(String.raw`(?:buy|enter|entry|add|accumulate|long|pick\s*up)\b[^.]{0,20}?(?:under|below|beneath|at|around|near|@)\s*${NUM}`, 'i'),
    new RegExp(String.raw`(?:entry|buy)\s*(?:zone|band|range|area)?\s*(?:of|at|:)?\s*${NUM}`, 'i'),
  ],
};

const first = (text: string, res: RegExp[]): number | null => {
  for (const re of res) {
    const m = text.match(re);
    if (m) return toNum(m[1]);
  }
  return null;
};

/**
 * Pure extraction. Returns whatever it is confident about and leaves the rest
 * null — a wrong level is far worse than a blank field, because the whole engine
 * judges against these numbers.
 */
export function extractThesisLocally(input: string): ParsedThesis {
  const text = (input || '').trim();
  if (!text) return { ...EMPTY };

  const out: ParsedThesis = { ...EMPTY, found: [] };

  // Direction first — "short" changes what the other numbers mean.
  if (/\b(short|puts?|bearish|downside)\b/i.test(text)) out.direction = 'short';
  else if (/\b(long|calls?|bullish|buy|accumulate)\b/i.test(text)) out.direction = 'long';

  // An explicit entry range wins over a single "under X".
  const entrySection = text.match(
    new RegExp(String.raw`(?:buy|enter|entry|add|accumulate)\b[^.]{0,40}`, 'i')
  )?.[0];
  const range = (entrySection ?? text).match(RANGE);
  if (range) {
    const a = toNum(range[1]);
    const b = toNum(range[2]);
    if (a != null && b != null) {
      out.entryLow = Math.min(a, b);
      out.entryHigh = Math.max(a, b);
    }
  } else {
    const at = first(text, PATTERNS.entry);
    if (at != null) {
      // "under 130" is a ceiling, not a point — give it a small band so the
      // engine has a zone to detect entry into.
      const under = /\b(under|below|beneath)\b/i.test(entrySection ?? text);
      out.entryHigh = at;
      out.entryLow = under ? Number((at * 0.95).toFixed(2)) : at;
    }
  }

  out.invalidationPrice = first(text, PATTERNS.invalidation);
  out.targetPrice = first(text, PATTERNS.target);

  const catalyst = text.match(/\b(earnings|fda|approval|guidance|split|product launch|conference|results)\b/i);
  if (catalyst) out.catalystNote = catalyst[1].toLowerCase();

  // Sanity: a long whose invalidation sits above its entry is a misparse, not a
  // plan. Drop the level rather than feed the engine something incoherent.
  const dir = out.direction ?? 'long';
  const entryMid =
    out.entryLow != null && out.entryHigh != null ? (out.entryLow + out.entryHigh) / 2 : out.entryHigh;
  if (entryMid != null && out.invalidationPrice != null) {
    const bad = dir === 'short' ? out.invalidationPrice < entryMid : out.invalidationPrice > entryMid;
    if (bad) out.invalidationPrice = null;
  }
  if (entryMid != null && out.targetPrice != null) {
    const bad = dir === 'short' ? out.targetPrice > entryMid : out.targetPrice < entryMid;
    if (bad) out.targetPrice = null;
  }

  for (const k of ['entryLow', 'entryHigh', 'invalidationPrice', 'targetPrice', 'direction', 'catalystNote'] as const) {
    if (out[k] != null) out.found.push(k);
  }
  return out;
}
