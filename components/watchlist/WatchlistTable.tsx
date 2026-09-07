'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, BellOff } from 'lucide-react';
import Sparkline from '@/components/watchlist/Sparkline';
import { fmtPrice, fmtPct, fmtMarketCap, severityTier, TIER_META, CATEGORY_META, timeAgo } from '@/lib/changes/display';

export type TableView = 'general' | 'thesis' | 'performance' | 'fundamentals';

type Col =
  | 'symbol' | 'price' | 'change' | 'entry' | 'invalidation' | 'target' | 'pe' | 'mcap'
  | 'catalyst' | 'category' | 'updates' | 'spark' | 'direction' | 'thesisText'
  | 'w52high' | 'w52low' | 'fromHigh' | 'fromLow' | 'asOf' | 'added' | 'reviewed';

const COL_META: Record<Col, { label: string; align?: 'right'; hint?: string }> = {
  symbol: { label: 'Symbol' },
  price: { label: 'Price', align: 'right' },
  change: { label: 'Chg %', align: 'right' },
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
};

export const TABLE_VIEWS: { key: TableView; label: string; cols: Col[] }[] = [
  { key: 'general',      label: 'General',      cols: ['symbol', 'price', 'change', 'entry', 'invalidation', 'target', 'pe', 'mcap', 'catalyst', 'updates', 'spark'] },
  { key: 'thesis',       label: 'Thesis',       cols: ['symbol', 'direction', 'thesisText', 'entry', 'invalidation', 'target', 'catalyst', 'category', 'reviewed', 'updates'] },
  { key: 'performance',  label: 'Performance',  cols: ['symbol', 'price', 'change', 'w52high', 'w52low', 'fromHigh', 'fromLow', 'spark'] },
  { key: 'fundamentals', label: 'Fundamentals', cols: ['symbol', 'price', 'mcap', 'pe', 'w52high', 'w52low', 'catalyst', 'asOf', 'added'] },
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
  }
};

const signed = (n: number | null, digits = 2) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
const tone = (n: number | null | undefined) =>
  n == null ? 'text-gray-500' : n >= 0 ? 'text-green-500' : 'text-red-500';

interface Props {
  entries: WatchlistEntry[];
  view: TableView;
  compact?: boolean;
  selected: Set<string>;
  onToggle: (symbol: string) => void;
  onToggleAll: (symbols: string[], select: boolean) => void;
}

export default function WatchlistTable({ entries, view, compact, selected, onToggle, onToggleAll }: Props) {
  const [sortBy, setSortBy] = useState<Col>('symbol');
  const [dir, setDir] = useState<1 | -1>(1);

  const cols = TABLE_VIEWS.find((v) => v.key === view)!.cols;

  const rows = [...entries].sort((a, b) => {
    const va = sortValue(a, sortBy);
    const vb = sortValue(b, sortBy);
    if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
    return (va - vb) * dir;
  });

  const toggleSort = (k: Col) => {
    if (k === sortBy) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortBy(k); setDir(['symbol', 'category', 'direction', 'thesisText'].includes(k) ? 1 : -1); }
  };

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
              <Link href={`/stocks/${e.symbol}`} className="font-semibold text-gray-100 hover:text-yellow-500">
                {e.symbol}
              </Link>
              {e.mutedUntil && <BellOff className="h-3 w-3 text-gray-600" />}
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
      case 'price': return <span className="tabular-nums text-gray-100">{fmtPrice(e.price)}</span>;
      case 'change': return <span className={`tabular-nums ${tone(e.changePercent)}`}>{fmtPct(e.changePercent)}</span>;
      case 'entry': {
        const d = e.distanceToEntryPct;
        return <span className={`tabular-nums ${d === 0 ? 'text-yellow-500' : 'text-gray-400'}`}>
          {d == null ? '—' : d === 0 ? 'in zone' : signed(d, 1)}
        </span>;
      }
      case 'invalidation': return <span className="tabular-nums text-gray-400">{fmtPrice(e.invalidationPrice)}</span>;
      case 'target': return <span className="tabular-nums text-gray-400">{fmtPrice(e.targetPrice)}</span>;
      case 'pe': return <span className="tabular-nums text-gray-400">{e.peRatio != null ? e.peRatio.toFixed(2) : '—'}</span>;
      case 'mcap': return <span className="tabular-nums text-gray-400">{fmtMarketCap(e.marketCap)}</span>;
      case 'w52high': return <span className="tabular-nums text-gray-400">{fmtPrice(e.week52High)}</span>;
      case 'w52low': return <span className="tabular-nums text-gray-400">{fmtPrice(e.week52Low)}</span>;
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
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-700 bg-gray-800">
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
          {rows.map((e) => (
            <tr
              key={e.symbol}
              className={`border-b border-gray-800 last:border-0 transition-colors ${
                selected.has(e.symbol) ? 'bg-yellow-500/5' : 'hover:bg-gray-800/50'
              }`}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
