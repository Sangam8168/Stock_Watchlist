'use server';

import { createHash } from 'crypto';
import { fetchJSON } from '@/lib/actions/finnhub.actions';
import { getDateRange, validateArticle } from '@/lib/utils';
import { isMarketOpen } from '@/lib/market';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

function token(): string {
  return process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';
}

type FinnhubQuote = { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };
type FinnhubProfile = { name?: string; marketCapitalization?: number; ticker?: string };
type FinnhubMetric = { metric?: Record<string, number | string | null> };
type FinnhubEarnings = { earningsCalendar?: Array<{ date?: string; symbol?: string }> };

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
  unconfirmedFields?: string[];
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
 * Assembles one point-in-time snapshot for a symbol from several Finnhub
 * endpoints. Every sub-fetch can fail independently: we degrade the `source`
 * label and mark `stale` rather than throwing, so the ingestion loop never
 * loses a whole cycle because one endpoint hiccuped.
 */
export async function buildSnapshot(rawSymbol: string): Promise<BuiltSnapshot> {
  const symbol = rawSymbol.trim().toUpperCase();
  const now = new Date();
  const t = token();

  if (!t) {
    return { symbol, capturedAt: now, asOf: now, stale: true, source: 'no-api-key' };
  }

  const range = getDateRange(5);
  const to90 = new Date(now.getTime() + 90 * 864e5).toISOString().slice(0, 10);

  const [quote, profile, metrics, earnings, news] = await Promise.all([
    safe('quote', () => fetchJSON<FinnhubQuote>(`${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${t}`)),
    safe('profile2', () => fetchJSON<FinnhubProfile>(`${FINNHUB_BASE_URL}/stock/profile2?symbol=${symbol}&token=${t}`, 3600)),
    safe('metrics', () => fetchJSON<FinnhubMetric>(`${FINNHUB_BASE_URL}/stock/metric?symbol=${symbol}&metric=all&token=${t}`, 3600)),
    safe('earnings', () => fetchJSON<FinnhubEarnings>(`${FINNHUB_BASE_URL}/calendar/earnings?symbol=${symbol}&from=${range.to}&to=${to90}&token=${t}`, 3600)),
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
    unconfirmedFields: unconfirmed.length ? unconfirmed : undefined,
  };
}

/** Lightweight current quote for display surfaces that just need a price. */
export async function getQuote(symbol: string): Promise<{ price?: number; changePercent?: number; asOf: Date; stale: boolean }> {
  const t = token();
  const now = new Date();
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
