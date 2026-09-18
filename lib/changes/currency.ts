// Client-safe currency helpers. Pure, so they're testable.

export const CURRENCIES = {
  USD: { symbol: '$', label: 'US Dollar' },
  INR: { symbol: '₹', label: 'Indian Rupee' },
  EUR: { symbol: '€', label: 'Euro' },
  GBP: { symbol: '£', label: 'Pound Sterling' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_SYMBOL: Record<string, string> =
  Object.fromEntries(Object.entries(CURRENCIES).map(([k, v]) => [k, v.symbol]));

/**
 * Convert an amount into the display currency.
 *
 * `from` is the currency the value is actually stored in. A listing quoted in
 * GBP must not be treated as dollars just because the app's base is USD — that
 * would silently misprice it, so an unknown source currency returns null rather
 * than a wrong number.
 */
export function convert(
  amount: number | null | undefined,
  to: string,
  rates: Record<string, number>,
  from = 'USD'
): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  if (from === to) return amount;

  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return null;

  // Rates are quoted against the base (USD), so go via it.
  return (amount / fromRate) * toRate;
}

/** Format a converted amount with the right symbol and sensible precision. */
export function fmtMoney(amount: number | null, code: string): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const sym = CURRENCY_SYMBOL[code] ?? '';
  const abs = Math.abs(amount);
  // Large figures read better abbreviated than with nine digits.
  if (abs >= 1e12) return `${sym}${(amount / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sym}${(amount / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sym}${(amount / 1e6).toFixed(2)}M`;
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
