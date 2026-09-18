'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, BellOff } from 'lucide-react';
import Sparkline from '@/components/watchlist/Sparkline';
import SymbolPreview from '@/components/watchlist/SymbolPreview';
import { convert, fmtMoney } from '@/lib/changes/currency';
import type { Timeframe } from '@/components/watchlist/TableControls';
import { fmtPrice, fmtPct, fmtMarketCap, severityTier, TIER_META, CATEGORY_META, timeAgo, currencyOf } from '@/lib/changes/display';

export type TableView = 'general' | 'thesis' | 'performance' | 'fundamentals' | 'holdings' | 'dividends' | 'earnings' | 'forecasts';

type Col =
  | 'symbol' | 'price' | 'change' | 'entry' | 'invalidation' | 'target' | 'pe' | 'mcap'
  | 'catalyst' | 'category' | 'updates' | 'spark' | 'direction' | 'thesisText'
  | 'w52high' | 'w52low' | 'fromHigh' | 'fromLow' | 'asOf' | 'added' | 'reviewed'
  | 'shares' | 'avgPrice' | 'marketValue' | 'profitLoss' | 'plPct' | 'pctPortfolio'
  | 'divShare' | 'divYield' | 'divGrowth' | 'payout'
  | 'r1w' | 'r1m' | 'r3m' | 'r6m' | 'rytd' | 'r1y'
  | 'earnDate' | 'earnTime' | 'epsEst' | 'epsActual' | 'revEst' | 'revActual'
  | 'revenue' | 'revGrowth' | 'eps' | 'epsGrowth' | 'beta' | 'rating';

const COL_META: Record<Col, { label: string; align?: 'right'; hint?: string }> = {
  symbol: { label: 'Symbol' },
  price: { label: 'Price', align: 'right' },
  change: { label: 'Chg %', align: 'right', hint: 'Period set by the timeframe control' },
  entry: { label: 'To entry', align: 'right', hint: 'Distance from your entry band' },
  invalidation: { label: 'Invalidation', align: 'right' },
  target: { label: 'Target', align: 'right' },
  pe: { label: 'PE Ratio', align: 'right' },
  mcap: { label: 'Market Cap', align: 'right' },
  catalyst: { label: 'Catalyst', align: 'right', hint: 'Trading days until earnings / your catalyst' },
  category: { label: 'Bucket' },
  updates: { label: 'Updates', align: 'right', hint: 'Unreviewed changes' },
  spark: { label: '30d', align: 'right' },
  direction: { label: 'Side' },
  thesisText: { label: 'Thesis' },
  w52high: { label: '52w High', align: 'right' },
  w52low: { label: '52w Low', align: 'right' },
  fromHigh: { label: '% off High', align: 'right' },
  fromLow: { label: '% Chg 52w Low', align: 'right' },
  asOf: { label: 'Data as of', align: 'right' },
  added: { label: 'Added', align: 'right' },
  reviewed: { label: 'Reviewed', align: 'right', hint: 'When you last re-read this thesis and confirmed it still holds' },

  // Holdings — your own numbers, not the provider's.
  shares: { label: 'Shares', align: 'right', hint: 'Set this on the item to track value and P&L' },
  avgPrice: { label: 'Avg. Price', align: 'right', hint: 'What you paid' },
  marketValue: { label: 'Market Value', align: 'right' },
  profitLoss: { label: 'Profit / Loss', align: 'right' },
  plPct: { label: 'Total P&L %', align: 'right' },
  pctPortfolio: { label: '% Portfolio', align: 'right', hint: 'Share of your total holdings value' },

  divShare: { label: 'Div / Share', align: 'right' },
  divYield: { label: 'Dividend Yield', align: 'right' },
  divGrowth: { label: 'Dividend Growth', align: 'right', hint: '5-year annualised' },
  payout: { label: 'Payout Ratio', align: 'right' },

  r1w: { label: 'Chg 1W', align: 'right' },
  r1m: { label: 'Chg 1M', align: 'right', hint: 'Month to date' },
  r3m: { label: 'Chg 3M', align: 'right', hint: '13 weeks' },
  r6m: { label: 'Chg 6M', align: 'right', hint: '26 weeks' },
  rytd: { label: 'Chg YTD', align: 'right' },
  r1y: { label: 'Chg 1Y', align: 'right' },

  earnDate: { label: 'Earnings Date', align: 'right' },
  earnTime: { label: 'Earnings Time', align: 'right', hint: 'bmo = before open, amc = after close' },
  epsEst: { label: 'EPS Estimate', align: 'right', hint: 'Next report' },
  epsActual: { label: 'EPS Actual', align: 'right', hint: 'Most recent report' },
  revEst: { label: 'Rev. Est.', align: 'right', hint: 'Next report' },
  revActual: { label: 'EPS Surprise', align: 'right', hint: 'How far the last report beat or missed its estimate' },

  revenue: { label: 'Revenue', align: 'right', hint: 'Trailing twelve months' },
  revGrowth: { label: 'Revenue Growth', align: 'right', hint: 'TTM year on year' },
  eps: { label: 'EPS', align: 'right', hint: 'Trailing twelve months' },
  epsGrowth: { label: 'EPS Growth', align: 'right', hint: 'TTM year on year' },
  beta: { label: 'Beta', align: 'right', hint: 'Volatility vs the market' },
  rating: { label: 'Analyst Rating', hint: 'Consensus of analyst recommendations. Price targets are not available on this data plan.' },
};

/** Grouped for the column picker — same order the preset tabs use. */
export const COLUMN_GROUPS: { group: string; cols: Col[] }[] = [
  { group: 'Core',        cols: ['price', 'change', 'spark', 'updates', 'category', 'direction'] },
  { group: 'Your thesis', cols: ['thesisText', 'entry', 'invalidation', 'target', 'catalyst', 'reviewed'] },
  { group: 'Holdings',    cols: ['shares', 'avgPrice', 'marketValue', 'profitLoss', 'plPct', 'pctPortfolio'] },
  { group: 'Performance', cols: ['r1w', 'r1m', 'r3m', 'r6m', 'rytd', 'r1y', 'w52high', 'w52low', 'fromHigh', 'fromLow'] },
  { group: 'Dividends',   cols: ['divShare', 'divYield', 'divGrowth', 'payout'] },
  { group: 'Earnings',    cols: ['earnDate', 'earnTime', 'epsEst', 'epsActual', 'revEst', 'revActual'] },
  { group: 'Fundamentals',cols: ['revenue', 'revGrowth', 'eps', 'epsGrowth', 'pe', 'mcap', 'beta', 'rating'] },
  { group: 'Meta',        cols: ['asOf', 'added'] },
];

export const COLUMN_LABEL = (c: Col) => COL_META[c].label;
export type { Col };

export const TABLE_VIEWS: { key: TableView; label: string; cols: Col[] }[] = [
  { key: 'general',      label: 'General',      cols: ['symbol', 'price', 'change', 'entry', 'invalidation', 'target', 'pe', 'mcap', 'catalyst', 'updates', 'spark'] },
  { key: 'thesis',       label: 'Thesis',       cols: ['symbol', 'direction', 'thesisText', 'entry', 'invalidation', 'target', 'catalyst', 'category', 'reviewed', 'updates'] },
  { key: 'performance',  label: 'Performance',  cols: ['symbol', 'price', 'change', 'r1w', 'r1m', 'r3m', 'r6m', 'rytd', 'r1y', 'spark'] },
  { key: 'fundamentals', label: 'Fundamentals', cols: ['symbol', 'price', 'change', 'revenue', 'revGrowth', 'eps', 'epsGrowth', 'pe', 'mcap', 'beta'] },
  { key: 'holdings',     label: 'Holdings',     cols: ['symbol', 'price', 'change', 'shares', 'avgPrice', 'marketValue', 'profitLoss', 'plPct', 'pctPortfolio'] },
  { key: 'dividends',    label: 'Dividends',    cols: ['symbol', 'price', 'change', 'divShare', 'divYield', 'divGrowth', 'payout'] },
  { key: 'forecasts',    label: 'Forecasts',    cols: ['symbol', 'price', 'change', 'rating', 'revGrowth', 'epsGrowth', 'pe', 'beta'] },
  { key: 'earnings',     label: 'Earnings',     cols: ['symbol', 'price', 'change', 'earnDate', 'earnTime', 'epsEst', 'epsActual', 'revEst', 'revActual'] },
];

const pctFrom = (price?: number | null, ref?: number | null) =>
  price != null && ref != null && ref > 0 ? ((price - ref) / ref) * 100 : null;

const sortValue = (e: WatchlistEntry, k: Col): number | string => {
  switch (k) {
    case 'symbol': return e.symbol;
    case 'category': return e.category;
    case 'direction': return e.direction;
    case 'thesisText': return e.thesis ?? '';
    case 'price': return e.price ?? -Infinity;
    case 'change': return e.changePercent ?? -Infinity;
    case 'entry': return e.distanceToEntryPct == null ? Infinity : Math.abs(e.distanceToEntryPct);
    case 'invalidation': return e.invalidationPrice ?? Infinity;
    case 'target': return e.targetPrice ?? Infinity;
    case 'pe': return e.peRatio ?? Infinity;
    case 'mcap': return e.marketCap ?? -Infinity;
    case 'catalyst': return e.catalystTradingDays ?? Infinity;
    case 'updates': return e.unseenCount;
    case 'w52high': return e.week52High ?? -Infinity;
    case 'w52low': return e.week52Low ?? -Infinity;
    case 'fromHigh': return pctFrom(e.price, e.week52High) ?? -Infinity;
    case 'fromLow': return pctFrom(e.price, e.week52Low) ?? -Infinity;
    case 'asOf': return e.dataAsOf ? +new Date(e.dataAsOf) : 0;
    case 'added': return +new Date(e.addedAt);
    case 'reviewed': return e.lastReviewedAt ? +new Date(e.lastReviewedAt) : 0;
    case 'spark': return e.priceHistory.length;
    case 'shares': return e.shares ?? -Infinity;
    case 'avgPrice': return e.ownedPrice ?? -Infinity;
    case 'marketValue': return e.marketValue ?? -Infinity;
    case 'profitLoss': return e.profitLoss ?? -Infinity;
    case 'plPct': return e.ownedReturnPct ?? -Infinity;
    case 'pctPortfolio': return e.marketValue ?? -Infinity;
    case 'divShare': return e.dividendPerShare ?? -Infinity;
    case 'divYield': return e.dividendYield ?? -Infinity;
    case 'divGrowth': return e.dividendGrowth5Y ?? -Infinity;
    case 'payout': return e.payoutRatio ?? -Infinity;
    case 'r1w': return e.return1W ?? -Infinity;
    case 'r1m': return e.return1M ?? -Infinity;
    case 'r3m': return e.return3M ?? -Infinity;
    case 'r6m': return e.return6M ?? -Infinity;
    case 'rytd': return e.returnYTD ?? -Infinity;
    case 'r1y': return e.return1Y ?? -Infinity;
    case 'earnDate': return e.catalystTradingDays ?? Infinity;
    case 'earnTime': return e.earningsTime ?? '';
    case 'epsEst': return e.epsEstimate ?? -Infinity;
    case 'epsActual': return e.lastEpsActual ?? -Infinity;
    case 'revEst': return e.revenueEstimate ?? -Infinity;
    case 'revActual': return e.lastEpsSurprisePct ?? -Infinity;
    case 'revenue': return e.revenueTTM ?? -Infinity;
    case 'revGrowth': return e.revenueGrowth ?? -Infinity;
    case 'eps': return e.eps ?? -Infinity;
    case 'epsGrowth': return e.epsGrowth ?? -Infinity;
    case 'beta': return e.beta ?? -Infinity;
    case 'rating': return e.analystRating ?? '';
  }
};

const signed = (n: number | null, digits = 2) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
const tone = (n: number | null | undefined) =>
  n == null ? 'text-gray-500' : n >= 0 ? 'text-green-500' : 'text-red-500';

interface Props {
  entries: WatchlistEntry[];
  view: TableView;
  /** When set, replaces the preset's columns entirely. */
  customCols?: Col[] | null;
  /** Which period the Chg column measures. */
  timeframe?: Timeframe;
  /** Display currency, and the rates to reach it. */
  currency?: string;
  fxRates?: Record<string, number>;
  groupBySector?: boolean;
  compact?: boolean;
  selected: Set<string>;
  onToggle: (symbol: string) => void;
  onToggleAll: (symbols: string[], select: boolean) => void;
}

export default function WatchlistTable({
  entries, view, customCols, compact, selected, onToggle, onToggleAll,
  timeframe = '1D', currency = 'USD', fxRates = { USD: 1 }, groupBySector = false,
}: Props) {
  // Money is stored in whatever the provider quoted; converting is a display
  // step, so every cell that shows an amount goes through here.
  const money = (v: number | null | undefined, from = 'USD') =>
    fmtMoney(convert(v, currency, fxRates, from), currency);

  const periodChange = (e: WatchlistEntry): number | null => {
    switch (timeframe) {
      case '1W': return e.return1W;
      case '1M': return e.return1M;
      case '3M': return e.return3M;
      case '6M': return e.return6M;
      case '1Y': return e.return1Y;
      default: return e.changePercent;
    }
  };

  const [sortBy, setSortBy] = useState<Col>('symbol');
  const [dir, setDir] = useState<1 | -1>(1);

  // 'symbol' is always first and never removable — without it a row has no
  // identity, and the picker shouldn't let you shoot yourself in the foot.
  const cols: Col[] = customCols?.length
    ? (['symbol', ...customCols.filter((c) => c !== 'symbol')] as Col[])
    : TABLE_VIEWS.find((v) => v.key === view)!.cols;

  const rows = [...entries].sort((a, b) => {
    // Sector becomes the primary key when grouping, else the chosen column
    // would scatter rows across group headers.
    if (groupBySector) {
      const sa = a.sector ?? 'zzz', sb = b.sector ?? 'zzz';
      if (sa !== sb) return sa.localeCompare(sb);
    }
    const va = sortValue(a, sortBy);
    const vb = sortValue(b, sortBy);
    if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
    return (va - vb) * dir;
  });

  const toggleSort = (k: Col) => {
    if (k === sortBy) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortBy(k); setDir(['symbol', 'category', 'direction', 'thesisText'].includes(k) ? 1 : -1); }
  };

  // "% Portfolio" is only meaningful against the total, so compute it once here
  // rather than per row.
  const portfolioValue = entries.reduce((sum, e) => sum + (e.marketValue ?? 0), 0);

  const allSymbols = rows.map((r) => r.symbol);
  const allSelected = allSymbols.length > 0 && allSymbols.every((s) => selected.has(s));
  const pad = compact ? 'py-1.5' : 'py-2.5';

  const renderCell = (e: WatchlistEntry, k: Col) => {
    switch (k) {
      case 'symbol': {
        const tier = e.unseenCount > 0 && !e.mutedUntil ? severityTier(e.topUnseenSeverity) : null;
        return (
          <>
            <span className="flex items-center gap-2">
              {tier && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIER_META[tier].dot}`} />}
              <SymbolPreview entry={e}>
                <Link href={`/stocks/${e.symbol}`} className="font-semibold text-gray-100 hover:text-yellow-500">
                  {e.symbol}
                </Link>
              </SymbolPreview>
              {e.mutedUntil && (
                <span
                  aria-label="muted"
                  title={`Alerts muted until ${new Date(e.mutedUntil).toLocaleDateString()} — select the row to unmute`}
                >
                  <BellOff className="h-3 w-3 text-amber-500/70" />
                </span>
              )}
            </span>
            {!compact && <span className="block max-w-[170px] truncate text-xs text-gray-600">{e.company}</span>}
          </>
        );
      }
      case 'direction':
        return e.direction === 'short'
          ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400">Short</span>
          : <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-green-500">Long</span>;
      case 'thesisText':
        return <span className="block max-w-[280px] truncate text-gray-300" title={e.thesis ?? ''}>{e.thesis || <span className="italic text-gray-600">no thesis</span>}</span>;
      case 'price': return <span className="tabular-nums text-gray-100">{money(e.price, e.currency ?? 'USD')}</span>;
      case 'change': {
        const v = periodChange(e);
        return <span className={`tabular-nums ${tone(v)}`}>{fmtPct(v)}</span>;
      }
      case 'entry': {
        const d = e.distanceToEntryPct;
        return <span className={`tabular-nums ${d === 0 ? 'text-yellow-500' : 'text-gray-400'}`}>
          {d == null ? '—' : d === 0 ? 'in zone' : signed(d, 1)}
        </span>;
      }
      case 'invalidation': return <span className="tabular-nums text-gray-400">{money(e.invalidationPrice, e.currency ?? 'USD')}</span>;
      case 'target': return <span className="tabular-nums text-gray-400">{money(e.targetPrice, e.currency ?? 'USD')}</span>;
      case 'pe': return <span className="tabular-nums text-gray-400">{e.peRatio != null ? e.peRatio.toFixed(2) : '—'}</span>;
      case 'mcap': return <span className="tabular-nums text-gray-400">{money(e.marketCap, e.currency ?? 'USD')}</span>;
      case 'w52high': return <span className="tabular-nums text-gray-400">{fmtPrice(e.week52High, currencyOf(e.symbol, e.currency))}</span>;
      case 'w52low': return <span className="tabular-nums text-gray-400">{fmtPrice(e.week52Low, currencyOf(e.symbol, e.currency))}</span>;
      case 'fromHigh': { const v = pctFrom(e.price, e.week52High); return <span className={`tabular-nums ${tone(v)}`}>{signed(v)}</span>; }
      case 'fromLow': { const v = pctFrom(e.price, e.week52Low); return <span className={`tabular-nums ${tone(v)}`}>{signed(v)}</span>; }
      case 'catalyst':
        return <span className={`tabular-nums ${e.catalystTradingDays != null && e.catalystTradingDays <= 5 ? 'text-amber-400' : 'text-gray-400'}`}>
          {e.catalystTradingDays == null ? '—' : `${e.catalystTradingDays}d`}
        </span>;
      case 'category': return <span className="whitespace-nowrap text-xs text-gray-500">{CATEGORY_META[e.category]?.label ?? e.category}</span>;
      case 'updates': {
        const tier = e.unseenCount > 0 ? severityTier(e.topUnseenSeverity) : null;
        return e.unseenCount > 0
          ? <span className={`text-xs font-semibold ${tier ? TIER_META[tier].text : ''}`}>{e.unseenCount}</span>
          : <span className="text-xs text-gray-700">—</span>;
      }
      case 'asOf': return <span className="whitespace-nowrap text-xs text-gray-500">{e.dataAsOf ? timeAgo(e.dataAsOf) : '—'}</span>;
      case 'added': return <span className="whitespace-nowrap text-xs text-gray-500">{timeAgo(e.addedAt)}</span>;
      case 'reviewed': {
        // A thesis you haven't re-read in a month is the one most likely to be stale.
        const stale = (e.daysSinceReview ?? 0) >= 30;
        return e.lastReviewedAt ? (
          <span className={`whitespace-nowrap text-xs ${stale ? 'text-amber-400' : 'text-gray-500'}`}>
            {timeAgo(e.lastReviewedAt)}
          </span>
        ) : (
          <span className={`whitespace-nowrap text-xs ${stale ? 'text-amber-400' : 'text-gray-700'}`}>never</span>
        );
      }
      case 'spark': return <span className="inline-block"><Sparkline data={e.priceHistory} width={72} height={22} /></span>;

      // --- Holdings. Blank rather than zero when you haven't entered shares:
      // "0" would read as a real position worth nothing.
      case 'shares':
        return <span className="tabular-nums text-gray-300">{e.shares != null ? e.shares.toLocaleString() : <span className="text-gray-700">—</span>}</span>;
      case 'avgPrice': return <span className="tabular-nums text-gray-400">{money(e.ownedPrice, e.currency ?? 'USD')}</span>;
      case 'marketValue': return <span className="tabular-nums text-gray-100">{money(e.marketValue, e.currency ?? 'USD')}</span>;
      case 'profitLoss': {
        const v = e.profitLoss;
        return <span className={`tabular-nums ${tone(v)}`}>{v == null ? '—' : `${v >= 0 ? '+' : '-'}${money(Math.abs(v), e.currency ?? 'USD')}`}</span>;
      }
      case 'plPct': return <span className={`tabular-nums ${tone(e.ownedReturnPct)}`}>{signed(e.ownedReturnPct)}</span>;
      case 'pctPortfolio': {
        const pct = portfolioValue > 0 && e.marketValue != null ? (e.marketValue / portfolioValue) * 100 : null;
        return <span className="tabular-nums text-gray-400">{pct == null ? '—' : `${pct.toFixed(1)}%`}</span>;
      }

      // --- Dividends
      case 'divShare': return <span className="tabular-nums text-gray-400">{e.dividendPerShare != null ? e.dividendPerShare.toFixed(3) : '—'}</span>;
      case 'divYield': return <span className="tabular-nums text-gray-400">{e.dividendYield != null ? `${e.dividendYield.toFixed(2)}%` : '—'}</span>;
      case 'divGrowth': return <span className={`tabular-nums ${tone(e.dividendGrowth5Y)}`}>{e.dividendGrowth5Y != null ? signed(e.dividendGrowth5Y) : '—'}</span>;
      case 'payout': return <span className="tabular-nums text-gray-400">{e.payoutRatio != null ? `${e.payoutRatio.toFixed(2)}%` : '—'}</span>;

      // --- Trailing returns
      case 'r1w': return <span className={`tabular-nums ${tone(e.return1W)}`}>{signed(e.return1W)}</span>;
      case 'r1m': return <span className={`tabular-nums ${tone(e.return1M)}`}>{signed(e.return1M)}</span>;
      case 'r3m': return <span className={`tabular-nums ${tone(e.return3M)}`}>{signed(e.return3M)}</span>;
      case 'r6m': return <span className={`tabular-nums ${tone(e.return6M)}`}>{signed(e.return6M)}</span>;
      case 'rytd': return <span className={`tabular-nums ${tone(e.returnYTD)}`}>{signed(e.returnYTD)}</span>;
      case 'r1y': return <span className={`tabular-nums ${tone(e.return1Y)}`}>{signed(e.return1Y)}</span>;

      // --- Earnings
      case 'earnDate':
        return <span className="whitespace-nowrap text-xs text-gray-400">{e.catalystDate ? new Date(e.catalystDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</span>;
      case 'earnTime': {
        const t = e.earningsTime;
        const label = t === 'amc' ? 'After Close' : t === 'bmo' ? 'Before Open' : t === 'dmh' ? 'During Hours' : null;
        return <span className="whitespace-nowrap text-xs text-gray-400">{label ?? '—'}</span>;
      }
      case 'epsEst': return <span className="tabular-nums text-gray-400">{e.epsEstimate != null ? e.epsEstimate.toFixed(2) : '—'}</span>;
      case 'epsActual': {
        // Beat or miss is the interesting part, so colour against the estimate.
        const a = e.lastEpsActual, est = e.lastEpsEstimate;
        const beat = a != null && est != null ? a - est : null;
        return <span className={`tabular-nums ${beat == null ? 'text-gray-400' : beat >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {a != null ? a.toFixed(2) : '—'}
        </span>;
      }
      case 'revEst': return <span className="tabular-nums text-gray-400">{e.revenueEstimate != null ? fmtMarketCap(e.revenueEstimate) : '—'}</span>;
      case 'revActual': {
        // The provider's reported endpoint gives an EPS surprise, not a revenue
        // actual, so show the beat/miss — the more useful figure regardless.
        const sp = e.lastEpsSurprisePct;
        return <span className={`tabular-nums ${tone(sp)}`}>{sp != null ? `${sp >= 0 ? '+' : ''}${sp.toFixed(1)}%` : '—'}</span>;
      }

      // --- Fundamentals
      case 'revenue': return <span className="tabular-nums text-gray-400">{money(e.revenueTTM, e.currency ?? 'USD')}</span>;
      case 'revGrowth': return <span className={`tabular-nums ${tone(e.revenueGrowth)}`}>{signed(e.revenueGrowth)}</span>;
      case 'eps': return <span className="tabular-nums text-gray-400">{e.eps != null ? e.eps.toFixed(2) : '—'}</span>;
      case 'epsGrowth': return <span className={`tabular-nums ${tone(e.epsGrowth)}`}>{signed(e.epsGrowth)}</span>;
      case 'beta': return <span className="tabular-nums text-gray-400">{e.beta != null ? e.beta.toFixed(2) : '—'}</span>;
      case 'rating': {
        const r = e.analystRating;
        if (!r) return <span className="text-gray-700">—</span>;
        const c = r.includes('Buy') ? 'text-green-500' : r.includes('Sell') ? 'text-red-500' : 'text-gray-300';
        return (
          <span className={`whitespace-nowrap text-xs ${c}`} title={e.analystCount ? `${e.analystCount} analysts` : undefined}>
            {r}
          </span>
        );
      }
    }
  };

  return (
    <div className="surface !p-0 overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b hairline bg-white/[0.03]">
            <th className="w-9 px-3 py-2.5 print:hidden">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(allSymbols, !allSelected)}
                aria-label="Select all"
                className="h-3.5 w-3.5 accent-yellow-500"
              />
            </th>
            {cols.map((k) => (
              <th
                key={k}
                title={COL_META[k].hint}
                onClick={() => toggleSort(k)}
                className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-gray-400 hover:text-gray-200 ${
                  COL_META[k].align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  {COL_META[k].label}
                  {sortBy === k && (dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e, idx) => (
            <Fragment key={e.symbol}>
              {groupBySector && (idx === 0 || (rows[idx - 1].sector ?? 'Other') !== (e.sector ?? 'Other')) && (
                <tr>
                  <td colSpan={cols.length + 1} className="bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {e.sector ?? 'Uncategorised'}
                  </td>
                </tr>
              )}
            <tr
              className={`border-b hairline last:border-0 transition-colors ${
                selected.has(e.symbol) ? 'bg-yellow-500/5' : 'hover:bg-gray-800/50'
              } ${e.mutedUntil ? 'opacity-55' : ''}`}
            >
              <td className={`px-3 ${pad} print:hidden`}>
                <input
                  type="checkbox"
                  checked={selected.has(e.symbol)}
                  onChange={() => onToggle(e.symbol)}
                  aria-label={`Select ${e.symbol}`}
                  className="h-3.5 w-3.5 accent-yellow-500"
                />
              </td>
              {cols.map((k) => (
                <td key={k} className={`px-3 ${pad} ${COL_META[k].align === 'right' ? 'text-right' : 'text-left'}`}>
                  {renderCell(e, k)}
                </td>
              ))}
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
