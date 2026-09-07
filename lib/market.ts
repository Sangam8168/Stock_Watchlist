// US equity market-hours helpers. All reasoning is done in America/New_York
// so the result is stable regardless of where the server or user is.

const NY_TZ = 'America/New_York';

// A small, deliberately incomplete list of full-day closures. Missing a holiday
// only makes us slightly more conservative about "the market is open" — it never
// produces a false "big move" alert, because those are gated on `isMarketOpen`.
const US_MARKET_HOLIDAYS_2025_2026 = new Set<string>([
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

type NyParts = { year: number; month: number; day: number; weekday: number; minutes: number; iso: string };

function nyParts(date: Date): NyParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  const minute = Number(parts.minute);
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  return { year, month, day, weekday: weekdayMap[parts.weekday] ?? 1, minutes: hour * 60 + minute, iso };
}

export function isTradingDay(date: Date = new Date()): boolean {
  const { weekday, iso } = nyParts(date);
  if (weekday === 0 || weekday === 6) return false;
  return !US_MARKET_HOLIDAYS_2025_2026.has(iso);
}

/** Regular session: 09:30–16:00 ET on a trading day. */
export function isMarketOpen(date: Date = new Date()): boolean {
  const { minutes } = nyParts(date);
  return isTradingDay(date) && minutes >= 570 && minutes < 960;
}

/**
 * How many trading days until `target` (0 = today, 1 = next open session, …).
 * Returns null for invalid / past dates.
 */
export function tradingDaysUntil(target: Date | string | undefined | null, from: Date = new Date()): number | null {
  if (!target) return null;
  const targetDate = typeof target === 'string' ? new Date(target) : target;
  if (Number.isNaN(targetDate.getTime())) return null;

  const targetIso = nyParts(targetDate).iso;
  const fromIso = nyParts(from).iso;
  if (targetIso < fromIso) return null;
  if (targetIso === fromIso) return 0;

  let count = 0;
  const cursor = new Date(from);
  // Walk day by day (cap at ~180 to stay bounded).
  for (let i = 0; i < 180; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isTradingDay(cursor)) count++;
    if (nyParts(cursor).iso >= targetIso) return count;
  }
  return null;
}

export function marketStatus(date: Date = new Date()): 'open' | 'closed-weekend' | 'closed-holiday' | 'pre' | 'after' {
  const { weekday, minutes, iso } = nyParts(date);
  if (weekday === 0 || weekday === 6) return 'closed-weekend';
  if (US_MARKET_HOLIDAYS_2025_2026.has(iso)) return 'closed-holiday';
  if (minutes < 570) return 'pre';
  if (minutes >= 960) return 'after';
  return 'open';
}
