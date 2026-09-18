'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Flame, Info } from 'lucide-react';
import { searchStocks } from '@/lib/actions/finnhub.actions';
import type { Discovery, DiscoverRow, TrendingItem } from '@/lib/actions/discover.actions';
import { useDebounce } from '@/hooks/useDebounce';
import { fmtMarketCap, fmtPrice, currencyOf } from '@/lib/changes/display';
import WatchStar from '@/components/search/WatchStar';

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

function Row({ row, right }: { row: DiscoverRow; right: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]">
      <Link href={`/stocks/${row.symbol}`} className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="font-semibold text-gray-100">{row.symbol}</span>
        <span className="truncate text-xs text-gray-600">{row.company}</span>
      </Link>
      {right}
      <WatchStar symbol={row.symbol} company={row.company} initial={row.isInWatchlist} />
    </li>
  );
}

function Section({
  title,
  hint,
  icon,
  rows,
  right,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  rows: DiscoverRow[];
  right: (r: DiscoverRow) => React.ReactNode;
}) {
  return (
    <section className="surface">
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      </div>
      <p className="mb-2 text-xs text-gray-600">{hint}</p>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-gray-600">Nothing here yet.</p>
      ) : (
        <ul className="-mx-2">
          {rows.map((r) => (
            <Row key={r.symbol} row={r} right={right(r)} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DiscoverView({
  discovery,
  trending,
}: {
  discovery: Discovery;
  trending: TrendingItem[];
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<StockWithWatchlistStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const query = q.trim();

  // Same guard as the palette: a 429 is retried with backoff, so an earlier
  // request can outlive a later one and overwrite it with stale results.
  const reqId = useRef(0);

  const run = async () => {
    if (!query) {
      reqId.current++;
      setLoading(false);
      setResults(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    try {
      const r = await searchStocks(query);
      if (id === reqId.current) setResults(r);
    } catch {
      if (id === reqId.current) setResults([]);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  const debounced = useDebounce(run, 300);
  useEffect(() => {
    debounced();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const changeCell = (r: DiscoverRow) => (
    <div className="shrink-0 text-right">
      <div className="text-sm tabular-nums text-gray-300">{fmtPrice(r.price, currencyOf(r.symbol))}</div>
      {r.changePercent != null && (
        <div className={`text-xs tabular-nums ${r.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {pct(r.changePercent)}
        </div>
      )}
    </div>
  );

  return (
    <div className="page-stack mx-auto max-w-4xl py-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Search</h1>
        <p className="text-sm text-gray-500">
          Find a stock, or start from what&rsquo;s moving.{' '}
          <span className="text-gray-600">
            Press <kbd className="rounded bg-white/5 px-1">⌘K</kbd> anywhere for the quick palette.
          </span>
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by ticker or company name…"
          autoFocus
          className="field-quiet w-full rounded-xl py-3 pl-10 pr-10 text-base text-gray-100 placeholder:text-gray-600"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-600" />}
      </div>

      {query ? (
        <section className="surface">
          <h2 className="mb-2 text-sm font-semibold text-gray-200">
            Results for &ldquo;{query}&rdquo;{results ? ` (${results.length})` : ''}
          </h2>
          {results === null ? (
            <p className="py-3 text-sm text-gray-600">Searching…</p>
          ) : results.length === 0 ? (
            <div className="py-3 text-sm text-gray-500">
              Nothing matching that.
              <p className="mt-1 text-xs text-gray-600">
                Foreign listings such as RELIANCE.NS are hidden — they have no live quote on this plan.
              </p>
            </div>
          ) : (
            <ul className="-mx-2">
              {results.map((s) => (
                <li key={s.symbol} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                  <Link href={`/stocks/${s.symbol}`} className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-gray-200">
                      <span className="font-semibold text-gray-100">{s.symbol}</span>
                      <span className="ml-2 text-gray-500">{s.name}</span>
                    </span>
                    <span className="text-xs text-gray-600">
                      {s.exchange} · {s.type}
                    </span>
                  </Link>
                  <WatchStar symbol={s.symbol} company={s.name} initial={s.isInWatchlist} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {/* Scope stated plainly. This is not the market — it is the symbols
              people here track, and pretending otherwise gets more wrong the
              smaller the user base is. */}
          <p className="flex items-start gap-1.5 text-xs text-gray-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Computed from the {discovery.universe} stock{discovery.universe === 1 ? '' : 's'} tracked by people using this
            app — not a market-wide scan. No extra API calls; it reuses prices already cached for the 15-minute poll.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Section
              title="Today's gainers"
              hint="Biggest daily moves up among tracked stocks."
              icon={<TrendingUp className="h-4 w-4 text-green-500" />}
              rows={discovery.gainers}
              right={changeCell}
            />
            <Section
              title="Today's losers"
              hint="Biggest daily moves down — often where a thesis gets tested."
              icon={<TrendingDown className="h-4 w-4 text-red-500" />}
              rows={discovery.losers}
              right={changeCell}
            />
            <Section
              title="Near 52-week high"
              hint="Momentum, or an expensive entry. The distance is the point."
              icon={<ArrowUpRight className="h-4 w-4 text-gray-400" />}
              rows={discovery.nearHigh}
              right={(r) => (
                <div className="shrink-0 text-right">
                  {/* A price above the stored high means the 52-week figure
                      hasn't caught up intraday — say "new high", never "-3.7%". */}
                  <div className="text-sm tabular-nums text-gray-300">
                    {r.offHighPct == null ? '—' : r.offHighPct <= 0 ? 'new high' : `${r.offHighPct.toFixed(1)}% below`}
                  </div>
                  <div className="text-xs text-gray-600">{fmtMarketCap(r.marketCap)}</div>
                </div>
              )}
            />
            <Section
              title="Near 52-week low"
              hint="Cheap, or falling for a reason. Worth a look either way."
              icon={<ArrowDownRight className="h-4 w-4 text-gray-400" />}
              rows={discovery.nearLow}
              right={(r) => (
                <div className="shrink-0 text-right">
                  <div className="text-sm tabular-nums text-gray-300">
                    {r.offLowPct == null ? '—' : r.offLowPct <= 0 ? 'new low' : `${r.offLowPct.toFixed(1)}% above`}
                  </div>
                  <div className="text-xs text-gray-600">
                    {r.peRatio != null ? `P/E ${r.peRatio.toFixed(1)}` : 'P/E —'}
                  </div>
                </div>
              )}
            />
          </div>

          {trending.length > 0 && (
            <Section
              title="Most watched here"
              hint="Watcher counts from this app's own users — not a vendor's trending feed."
              icon={<Flame className="h-4 w-4 text-yellow-500" />}
              rows={trending.map((t) => ({
                symbol: t.symbol,
                company: t.company,
                price: t.price,
                changePercent: t.changePercent,
                offHighPct: null,
                offLowPct: null,
                peRatio: null,
                marketCap: null,
                watchers: t.watchers,
                isInWatchlist: t.isInWatchlist,
              }))}
              right={(r) => (
                <div className="shrink-0 text-right">
                  <div className="text-sm tabular-nums text-gray-300">
                    {fmtPrice(r.price, currencyOf(r.symbol))}
                  </div>
                  <div className="text-xs text-gray-600">{r.watchers} watching</div>
                </div>
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
