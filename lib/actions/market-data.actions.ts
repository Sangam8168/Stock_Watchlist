'use server';


import { createHash } from 'crypto';
import { fetchJSON } from '@/lib/actions/finnhub.actions';
import { getDateRange, validateArticle } from '@/lib/utils';
import { isMarketOpen } from '@/lib/market';
import { exchangeOf } from '@/lib/changes/exchange';
import { getIndianQuote } from '@/lib/actions/yahoo.actions';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

function token(): string {
  return process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';
}

type FinnhubQuote = { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };
type FinnhubProfile = { name?: string; marketCapitalization?: number; ticker?: string; shareOutstanding?: number; finnhubIndustry?: string; currency?: string };
type FinnhubMetric = { metric?: Record<string, number | string | null> };
type FinnhubRecommendation = Array<{
  period?: string;
  strongBuy?: number; buy?: number; hold?: number; sell?: number; strongSell?: number;
}>;

type FinnhubReported = Array<{
  period?: string;
  actual?: number | null;
  estimate?: number | null;
  surprisePercent?: number | null;
}>;

type FinnhubEarnings = {
  earningsCalendar?: Array<{
    date?: string;
    symbol?: string;
    hour?: string;            // 'bmo' | 'amc' | 'dmh'
    epsEstimate?: number | null;
    epsActual?: number | null;
    revenueEstimate?: number | null;
    revenueActual?: number | null;
  }>;
};

interface BuiltSnapshot {
  symbol: string;
  capturedAt: Date;
  asOf: Date;
  stale: boolean;
  source: string;
  price?: number;
  changePercent?: number;
  dayHigh?: number;
  dayLow?: number;
  prevClose?: number;
  week52High?: number;
  week52Low?: number;
  peRatio?: number;
  marketCap?: number;
  nextEarningsDate?: Date;
  newsHash?: string;
  newsCount?: number;
  topHeadline?: string;
  /** Link to that headline. The fetch already returns it; not keeping it meant
   *  the engine could quote a source it could not cite. */
  topHeadlineUrl?: string;
  unconfirmedFields?: string[];
  /** The exchange has no such listing — the ticker was renamed, delisted or demerged. */
  symbolNotFound?: boolean;

  // Trailing returns, as percentages. 3Y/5Y are absent because the provider
  // does not expose them on this plan — better a missing column than an
  // invented one.
  return1W?: number;
  return1M?: number;
  return3M?: number;
  return6M?: number;
  returnYTD?: number;
  return1Y?: number;

  dividendPerShare?: number;
  dividendYield?: number;
  dividendGrowth5Y?: number;
  payoutRatio?: number;

  revenuePerShare?: number;
  revenueTTM?: number;
  eps?: number;
  revenueGrowth?: number;
  epsGrowth?: number;
  beta?: number;

  earningsTime?: string;
  epsEstimate?: number;
  revenueEstimate?: number;
  lastEarningsDate?: Date;
  lastEpsActual?: number;
  lastEpsEstimate?: number;
  lastEpsSurprisePct?: number;
  analystRating?: string;
  analystCount?: number;
  sector?: string;
  currency?: string;
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`buildSnapshot: ${label} failed`, e instanceof Error ? e.message : e);
    return null;
  }
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/**
 * The Indian path. Fewer fields than the US one — no P/E, market cap, analyst
 * consensus or earnings calendar from this source — so those are left undefined
 * and named in `unconfirmedFields` rather than defaulted to zero. A dash is
 * true; a zero in a price column is a lie.
 */
async function buildIndianSnapshot(symbol: string, now: Date): Promise<BuiltSnapshot> {
  const q = await getIndianQuote(symbol);
  return {
    symbol,
    capturedAt: now,
    asOf: q.asOf,
    stale: q.stale,
    source: 'yahoo',
    price: q.price,
    changePercent: q.changePercent,
    dayHigh: q.dayHigh,
    dayLow: q.dayLow,
    prevClose: q.prevClose,
    week52High: q.week52High,
    week52Low: q.week52Low,
    currency: q.currency,
    symbolNotFound: q.notFound,
    unconfirmedFields: ['peRatio', 'marketCap', 'earnings', 'analystRating', 'news'],
  };
}

/**
 * Assembles one point-in-time snapshot for a symbol from several Finnhub
 * endpoints. Every sub-fetch can fail independently: we degrade the `source`
 * label and mark `stale` rather than throwing, so the ingestion loop never
 * loses a whole cycle because one endpoint hiccuped.
 */
export async function buildSnapshot(rawSymbol: string): Promise<BuiltSnapshot> {
  const symbol = rawSymbol.trim().toUpperCase();
  const now = new Date();

  // Indian listings route to a different provider, because the primary one
  // returns a null price for every one of them on this plan. The two paths
  // converge on the same BuiltSnapshot shape, so nothing downstream — detection,
  // health, coverage, the digest — needs to know which venue a symbol came from.
  if (exchangeOf(symbol).id !== 'US') return buildIndianSnapshot(symbol, now);

  const t = token();

  if (!t) {
    return { symbol, capturedAt: now, asOf: now, stale: true, source: 'no-api-key' };
  }

  const range = getDateRange(5);
  const to90 = new Date(now.getTime() + 90 * 864e5).toISOString().slice(0, 10);

  const [quote, profile, metrics, earnings, reportedEarnings, recommendation, news] = await Promise.all([
    safe('quote', () => fetchJSON<FinnhubQuote>(`${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${t}`)),
    safe('profile2', () => fetchJSON<FinnhubProfile>(`${FINNHUB_BASE_URL}/stock/profile2?symbol=${symbol}&token=${t}`, 3600)),
    safe('metrics', () => fetchJSON<FinnhubMetric>(`${FINNHUB_BASE_URL}/stock/metric?symbol=${symbol}&metric=all&token=${t}`, 3600)),
    safe('earnings', () => fetchJSON<FinnhubEarnings>(`${FINNHUB_BASE_URL}/calendar/earnings?symbol=${symbol}&from=${range.to}&to=${to90}&token=${t}`, 3600)),
    // Reported figures — the calendar only has scheduled events with null actuals.
    safe('reported', () => fetchJSON<FinnhubReported>(`${FINNHUB_BASE_URL}/stock/earnings?symbol=${symbol}&token=${t}`, 3600)),
    // Analyst consensus. The price-target endpoint is premium (403), so this is
    // a rating only — no target, because an invented one is worse than none.
    safe('recommendation', () => fetchJSON<FinnhubRecommendation>(`${FINNHUB_BASE_URL}/stock/recommendation?symbol=${symbol}&token=${t}`, 3600)),
    safe('news', () => fetchJSON<Array<{ headline?: string; summary?: string; url?: string; datetime?: number; id?: number }>>(
      `${FINNHUB_BASE_URL}/company-news?symbol=${symbol}&from=${range.from}&to=${range.to}&token=${t}`, 900)),
  ]);

  const m = metrics?.metric ?? {};
  // Finnhub returns `{ c: 0, pc: 0, t: 0, ... }` for an unknown / delisted ticker.
  // That is "no data", not "the stock is worth $0".
  const rawClose = num(quote?.c);
  const hasQuote = !!quote && typeof rawClose === 'number' && rawClose > 0;
  const price = hasQuote ? rawClose : undefined;

  const failed: string[] = [];
  if (!hasQuote) failed.push('quote');
  if (!profile) failed.push('profile');
  if (!metrics) failed.push('metrics');
  const asOfSeconds = num(quote?.t);
  const asOf = asOfSeconds && asOfSeconds > 0 ? new Date(asOfSeconds * 1000) : now;
  const prevClose = num(quote?.pc);

  // Prefer Finnhub's daily % (`dp`), but derive it from close vs prev-close when missing.
  let changePercent = num(quote?.dp);
  if (changePercent == null && price != null && prevClose && prevClose > 0) {
    changePercent = ((price - prevClose) / prevClose) * 100;
  }

  // Stale if: no usable quote, or the quote timestamp is >20min old while the US
  // market is open (a live feed should be near-real-time during RTH).
  const quoteAgeMin = (now.getTime() - asOf.getTime()) / 60000;
  const stale = !hasQuote || (isMarketOpen(now) && quoteAgeMin > 20);

  // News: hash the trailing headline set so a *changed* set is detectable, and
  // count articles for "how much new coverage".
  const validNews = (news ?? []).filter((a) => validateArticle(a as never));
  const sortedNews = validNews.sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0));
  const newsHash = sortedNews.length
    ? createHash('sha1').update(sortedNews.map((a) => a.url || a.id).join('|')).digest('hex').slice(0, 16)
    : undefined;

  // Conflicting sources: profile market cap vs. metric market cap.
  const profileCap = num(profile?.marketCapitalization); // millions USD
  const metricCap = num(m.marketCapitalization);
  const unconfirmed: string[] = [];
  if (profileCap && metricCap && Math.abs(profileCap - metricCap) / Math.max(profileCap, metricCap) > 0.05) {
    unconfirmed.push('marketCap');
  }

  const nextEarnings = earnings?.earningsCalendar?.find((e) => e.date)?.date;

  // The calendar is not sorted, so "first future entry" is not the *soonest* —
  // that returned a date two quarters out. Sort before picking.
  const today = new Date(now.toDateString());
  const cal = earnings?.earningsCalendar ?? [];
  const upcoming = cal
    .filter((e) => e.date && new Date(e.date) >= today)
    .sort((a, b) => +new Date(a.date!) - +new Date(b.date!))[0];

  // Actuals do not live on the calendar — its epsActual is null for scheduled
  // events. /stock/earnings carries reported figures, newest first.
  const reported = (reportedEarnings ?? [])
    .filter((r) => r.period)
    .sort((a, b) => +new Date(b.period!) - +new Date(a.period!))[0];

  // Newest period first; Finnhub returns them unsorted.
  const rec = (recommendation ?? [])
    .filter((r) => r.period)
    .sort((a, b) => +new Date(b.period!) - +new Date(a.period!))[0];
  const rating = (() => {
    if (!rec) return undefined;
    const sb = rec.strongBuy ?? 0, b = rec.buy ?? 0, h = rec.hold ?? 0,
          sl = rec.sell ?? 0, ss = rec.strongSell ?? 0;
    const total = sb + b + h + sl + ss;
    if (!total) return undefined;
    // 1 = strong sell … 5 = strong buy
    const score = (sb * 5 + b * 4 + h * 3 + sl * 2 + ss * 1) / total;
    const label =
      score >= 4.5 ? 'Strong Buy' : score >= 3.5 ? 'Buy' :
      score >= 2.5 ? 'Hold' : score >= 1.5 ? 'Sell' : 'Strong Sell';
    return { label, total };
  })();

  return {
    symbol,
    capturedAt: now,
    asOf,
    stale,
    source: !hasQuote ? 'finnhub:no-quote' : failed.length ? `finnhub:partial(${failed.join(',')})` : 'finnhub',
    price,
    changePercent: changePercent != null ? Number(changePercent.toFixed(4)) : undefined,
    dayHigh: num(quote?.h),
    dayLow: num(quote?.l),
    prevClose,
    week52High: num(m['52WeekHigh']),
    week52Low: num(m['52WeekLow']),
    peRatio: num(m.peBasicExclExtraTTM) ?? num(m.peTTM) ?? num(m.peNormalizedAnnual),
    marketCap: profileCap ? profileCap * 1e6 : metricCap ? metricCap * 1e6 : undefined,
    nextEarningsDate: nextEarnings ? new Date(nextEarnings) : undefined,
    newsHash,
    newsCount: sortedNews.length,
    topHeadline: sortedNews[0]?.headline?.trim(),
    topHeadlineUrl: sortedNews[0]?.url?.trim() || undefined,
    unconfirmedFields: unconfirmed.length ? unconfirmed : undefined,

    // --- Trailing returns. Finnhub reports these as percentages already.
    // 13W/26W stand in for 3M/6M; the provider has no 3Y or 5Y on this plan,
    // so those columns are deliberately absent rather than approximated.
    return1W: num(m['5DayPriceReturnDaily']),
    return1M: num(m.monthToDatePriceReturnDaily),
    return3M: num(m['13WeekPriceReturnDaily']),
    return6M: num(m['26WeekPriceReturnDaily']),
    returnYTD: num(m.yearToDatePriceReturnDaily),
    return1Y: num(m['52WeekPriceReturnDaily']),

    // --- Dividends
    dividendPerShare: num(m.dividendPerShareAnnual) ?? num(m.dividendPerShareTTM),
    dividendYield: num(m.dividendYieldIndicatedAnnual),
    dividendGrowth5Y: num(m.dividendGrowthRate5Y),
    payoutRatio: num(m.payoutRatioTTM),

    // --- Fundamentals. Revenue is reported per share, so scale by shares
    // outstanding (millions) to get an absolute figure comparable to the
    // market cap shown next to it.
    revenuePerShare: num(m.revenuePerShareTTM),
    revenueTTM:
      num(m.revenuePerShareTTM) != null && num(profile?.shareOutstanding) != null
        ? num(m.revenuePerShareTTM)! * num(profile?.shareOutstanding)! * 1e6
        : undefined,
    eps: num(m.epsTTM) ?? num(m.epsBasicExclExtraItemsTTM),
    revenueGrowth: num(m.revenueGrowthTTMYoy),
    epsGrowth: num(m.epsGrowthTTMYoy),
    beta: num(m.beta),

    // --- Earnings detail
    earningsTime: upcoming?.hour || undefined,
    epsEstimate: num(upcoming?.epsEstimate),
    revenueEstimate: num(upcoming?.revenueEstimate),
    lastEarningsDate: reported?.period ? new Date(reported.period) : undefined,
    lastEpsActual: num(reported?.actual),
    lastEpsEstimate: num(reported?.estimate),
    lastEpsSurprisePct: num(reported?.surprisePercent),

    // Weighted consensus: strong opinions count double, so a wall of "hold"
    // doesn't read the same as a split between strong buy and strong sell.
    analystRating: rating?.label,
    analystCount: rating?.total,
    sector: profile?.finnhubIndustry || undefined,
    // The currency the provider reports this listing in — a non-USD listing
    // must not be silently converted as if it were dollars.
    currency: profile?.currency || undefined,
  };
}

/** Lightweight current quote for display surfaces that just need a price. */
export async function getQuote(symbol: string): Promise<{ price?: number; changePercent?: number; asOf: Date; stale: boolean }> {
  const now = new Date();

  // Route the same way buildSnapshot does. Without this the thesis dialog shows
  // no live price for an NSE listing, which means setting an entry band and an
  // invalidation level with nothing to anchor them against.
  if (exchangeOf(symbol).id !== 'US') {
    const q = await getIndianQuote(symbol, 60);
    return { price: q.price, changePercent: q.changePercent, asOf: q.asOf, stale: q.stale };
  }

  const t = token();
  if (!t) return { asOf: now, stale: true };
  const q = await safe('quote', () => fetchJSON<FinnhubQuote>(`${FINNHUB_BASE_URL}/quote?symbol=${symbol.toUpperCase()}&token=${t}`));
  const close = num(q?.c);
  const hasQuote = typeof close === 'number' && close > 0;
  const asOf = q?.t && q.t > 0 ? new Date(q.t * 1000) : now;
  return {
    price: hasQuote ? close : undefined,
    changePercent: num(q?.dp),
    asOf,
    stale: !hasQuote || (isMarketOpen(now) && (now.getTime() - asOf.getTime()) / 60000 > 20),
  };
}
