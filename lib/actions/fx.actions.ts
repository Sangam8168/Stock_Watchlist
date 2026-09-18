'use server';

// Currency conversion for display.
//
// Finnhub's forex endpoints are premium (403 on this plan), so rates come from
// frankfurter.app — the ECB's published reference rates, keyless and free.
//
// A rate is a *display* concern only: prices are always stored in the currency
// the provider reported them in. Converting on write would bake a rate into
// history and quietly corrupt every past snapshot the next time it moved.

import { log } from '@/lib/observability/logger';
import { CURRENCIES } from '@/lib/changes/currency';

interface FxRates {
  base: 'USD';
  rates: Record<string, number>;
  /** The ECB publishes once per working day; this is that day. */
  asOf: string | null;
}

const FALLBACK: FxRates = { base: 'USD', rates: { USD: 1 }, asOf: null };

/**
 * USD-based rates, revalidated hourly.
 *
 * Fails soft to USD-only: a missing rate must leave prices as they are, never
 * render them multiplied by an undefined.
 */
export async function getFxRates(): Promise<FxRates> {
  const symbols = Object.keys(CURRENCIES).filter((c) => c !== 'USD').join(',');
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${symbols}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
    if (!data?.rates) throw new Error('no rates in response');
    return { base: 'USD', rates: { USD: 1, ...data.rates }, asOf: data.date ?? null };
  } catch (err) {
    log.warn('fx.unavailable', { symbols }, err);
    return FALLBACK;
  }
}
