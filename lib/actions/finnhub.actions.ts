'use server';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { cache } from 'react';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/** Shown before the user types. Static on purpose — see the note in searchStocks. */
const SEED_SYMBOLS: ReadonlyArray<readonly [string, string]> = [
  ['AAPL', 'Apple Inc'],
  ['MSFT', 'Microsoft Corp'],
  ['NVDA', 'NVIDIA Corp'],
  ['GOOGL', 'Alphabet Inc'],
  ['AMZN', 'Amazon.com Inc'],
  ['META', 'Meta Platforms Inc'],
  ['TSLA', 'Tesla Inc'],
  ['JPM', 'JPMorgan Chase & Co'],
  ['LLY', 'Eli Lilly & Co'],
  ['XOM', 'Exxon Mobil Corp'],
];

const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
  const options: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
    ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
    : { cache: 'no-store' };

  // Finnhub free tier is 60 req/min. On a 429 (or transient 5xx) back off and
  // retry twice with jitter rather than letting a whole ingestion batch fail.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return (await res.json()) as T;

    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`Fetch failed ${res.status}`);
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      await sleep(retryAfter * 1000 || 400 * 2 ** attempt + Math.random() * 300);
      continue;
    }
    const text = await res.text().catch(() => '');
    throw new Error(`Fetch failed ${res.status}: ${text}`);
  }
  throw lastErr ?? new Error('Fetch failed after retries');
}

export { fetchJSON };

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
  try {
    const range = getDateRange(5);
    const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      throw new Error('FINNHUB API key is not configured');
    }
    const cleanSymbols = (symbols || [])
      .map((s) => s?.trim().toUpperCase())
      .filter((s): s is string => Boolean(s));

    const maxArticles = 6;

    // If we have symbols, try to fetch company news per symbol and round-robin select
    if (cleanSymbols.length > 0) {
      const perSymbolArticles: Record<string, RawNewsArticle[]> = {};

      await Promise.all(
        cleanSymbols.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}&token=${token}`;
            const articles = await fetchJSON<RawNewsArticle[]>(url, 300);
            perSymbolArticles[sym] = (articles || []).filter(validateArticle);
          } catch (e) {
            console.error('Error fetching company news for', sym, e);
            perSymbolArticles[sym] = [];
          }
        })
      );

      const collected: MarketNewsArticle[] = [];
      // Round-robin up to 6 picks
      for (let round = 0; round < maxArticles; round++) {
        for (let i = 0; i < cleanSymbols.length; i++) {
          const sym = cleanSymbols[i];
          const list = perSymbolArticles[sym] || [];
          if (list.length === 0) continue;
          const article = list.shift();
          if (!article || !validateArticle(article)) continue;
          collected.push(formatArticle(article, true, sym, round));
          if (collected.length >= maxArticles) break;
        }
        if (collected.length >= maxArticles) break;
      }

      if (collected.length > 0) {
        // Sort by datetime desc
        collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
        return collected.slice(0, maxArticles);
      }
      // If none collected, fall through to general news
    }

    // General market news fallback or when no symbols provided
    const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
    const general = await fetchJSON<RawNewsArticle[]>(generalUrl, 300);

    const seen = new Set<string>();
    const unique: RawNewsArticle[] = [];
    for (const art of general || []) {
      if (!validateArticle(art)) continue;
      const key = `${art.id}-${art.url}-${art.headline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(art);
      if (unique.length >= 20) break; // cap early before final slicing
    }

    const formatted = unique.slice(0, maxArticles).map((a, idx) => formatArticle(a, false, undefined, idx));
    return formatted;
  } catch (err) {
    console.error('getNews error:', err);
    throw new Error('Failed to fetch news');
  }
}

export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
  try {
    const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      // If no token, log and return empty to avoid throwing per requirements
      console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
      return [];
    }

    const trimmed = typeof query === 'string' ? query.trim() : '';

    let results: FinnhubSearchResult[] = [];

    if (!trimmed) {
      // The empty-query case only seeds the search dropdown with a few well-known
      // names — it needs a ticker and a label, nothing live. It used to fetch 10
      // profile2 endpoints in parallel, which ran on EVERY page load (the header
      // is a server component) and burned through Finnhub's 60 req/min free tier,
      // producing 429s that then retried into 30 requests. Served statically now:
      // zero API calls, and the quota stays available for real searches and the poll.
      results = SEED_SYMBOLS.map(([symbol, description]) => ({
        symbol,
        description,
        displaySymbol: symbol,
        type: 'Common Stock',
      }));
    } else {
      const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
      const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
      results = Array.isArray(data?.result) ? data.result : [];
    }

    const mapped: StockWithWatchlistStatus[] = results
      .map((r) => {
        const upper = (r.symbol || '').toUpperCase();
        const name = r.description || upper;
        const exchangeFromDisplay = (r.displaySymbol as string | undefined) || undefined;
        const exchangeFromProfile = (r as any).__exchange as string | undefined;
        const exchange = exchangeFromDisplay || exchangeFromProfile || 'US';
        const type = r.type || 'Stock';
        const item: StockWithWatchlistStatus = {
          symbol: upper,
          name,
          exchange,
          type,
          isInWatchlist: false,
        };
        return item;
      })
      .filter((s) => s.symbol);

    // Finnhub returns one row per listing, so the same ticker can come back
    // several times (different exchanges / share classes). We key the picker by
    // symbol and adding either row does the same thing, so keep the first only.
    const seen = new Set<string>();
    const deduped = mapped.filter((s) => {
      if (seen.has(s.symbol)) return false;
      seen.add(s.symbol);
      return true;
    });

    return deduped.slice(0, 15);
  } catch (err) {
    console.error('Error in stock search:', err);
    return [];
  }
});

