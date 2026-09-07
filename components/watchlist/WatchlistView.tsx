'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Mail, LayoutGrid, Table2, LineChart, History, X, Trash2, BellOff, Briefcase, Check } from 'lucide-react';
import { useDeviceId } from '@/hooks/useDeviceId';
import { useUiPrefs } from '@/hooks/useUiPrefs';
import {
  getWatchlist,
  getSinceYouLeft,
  refreshMyWatchlist,
  sendTestDigest,
  ensureSeenBaseline,
  bulkRemoveFromWatchlist,
  bulkSetCategory,
  bulkSnooze,
  markThesisReviewed,
  moveToPortfolio,
  returnToWatchlist,
} from '@/lib/actions/watchlist.actions';
import { seedDemoWatchlist, simulateSinceYouLeft } from '@/lib/actions/demo.actions';
import { CATEGORY_META, fmtPct, fmtMarketCap } from '@/lib/changes/display';
import SinceYouLeft from '@/components/watchlist/SinceYouLeft';
import WatchlistRow from '@/components/watchlist/WatchlistRow';
import WatchlistTable, { TABLE_VIEWS, type TableView } from '@/components/watchlist/WatchlistTable';
import WatchlistOptions from '@/components/watchlist/WatchlistOptions';
import ChartView from '@/components/watchlist/ChartView';
import ChangeHistory from '@/components/watchlist/ChangeHistory';
import IndexStrip from '@/components/watchlist/IndexStrip';
import AddSymbol from '@/components/watchlist/AddSymbol';
import Reveal from '@/components/Reveal';

const CATEGORY_ORDER: WatchlistCategoryName[] = ['active', 'developing', 'earnings', 'longterm', 'speculative'];

type FilterKey = 'all' | 'attention' | 'near' | 'catalyst' | 'muted';
type SortKey = 'category' | 'attention' | 'distance' | 'catalyst' | 'recent' | 'az';
type Layout = 'cards' | 'table' | 'chart' | 'history';

const FILTERS: { key: FilterKey; label: string; test: (e: WatchlistEntry) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'attention', label: 'Needs attention', test: (e) => e.mutedUntil == null && e.topUnseenSeverity >= 50 },
  { key: 'near', label: 'Near entry', test: (e) => e.distanceToEntryPct != null && Math.abs(e.distanceToEntryPct) <= 3 },
  { key: 'catalyst', label: 'Catalyst ≤ 2wk', test: (e) => e.catalystTradingDays != null && e.catalystTradingDays <= 10 },
  { key: 'muted', label: 'Muted', test: (e) => e.mutedUntil != null },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'category', label: 'Category' },
  { key: 'attention', label: 'Most attention' },
  { key: 'distance', label: 'Closest to entry' },
  { key: 'catalyst', label: 'Catalyst soonest' },
  { key: 'recent', label: 'Recently added' },
  { key: 'az', label: 'A–Z' },
];

export default function WatchlistView() {
  const deviceId = useDeviceId();
  const { prefs, set: setPref, reset: resetPrefs } = useUiPrefs();

  const [entries, setEntries] = useState<WatchlistEntry[] | null>(null);
  const [digest, setDigest] = useState<SinceYouLeftDigest | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('category');
  const [layout, setLayout] = useState<Layout>('cards');
  const [tableView, setTableView] = useState<TableView>('general');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [baselineDone, setBaselineDone] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const load = useCallback(async () => {
    if (!deviceId) return;
    if (!baselineDone) {
      await ensureSeenBaseline(deviceId);
      setBaselineDone(true);
    }
    const [e, d] = await Promise.all([getWatchlist(deviceId), getSinceYouLeft(deviceId)]);
    setEntries(e);
    setDigest(d);
    setDataVersion((v) => v + 1);
  }, [deviceId, baselineDone]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime updates — poll the materialised rows (no provider calls) every 45s.
  useEffect(() => {
    if (!prefs.realtime || !deviceId) return;
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, [prefs.realtime, deviceId, load]);

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      const res = await refreshMyWatchlist();
      toast.success(
        res.events > 0
          ? `Refreshed ${res.symbols} symbols · ${res.events} new update${res.events === 1 ? '' : 's'}`
          : `Refreshed ${res.symbols} symbols · nothing new`
      );
      await load();
    } catch {
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const [emailing, setEmailing] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; text: string } | null>(null);

  const emailDigest = async () => {
    setEmailing(true);
    try {
      const res = await sendTestDigest();
      // Always name the destination — the digest goes to the signed-in account's
      // address, which isn't necessarily the inbox you're looking at.
      const text = res.ok ? `Digest sent to ${res.sentTo}` : res.reason || 'Could not send';
      setEmailResult({ ok: res.ok, text });
      toast[res.ok ? 'success' : 'error'](text, { duration: res.ok ? 6000 : 10000 });
    } catch (e) {
      // Without this the action's rejection was swallowed and the click looked
      // like it did nothing at all.
      const text = e instanceof Error ? `Could not send: ${e.message}` : 'Could not send the digest';
      setEmailResult({ ok: false, text });
      toast.error(text, { duration: 10000 });
    } finally {
      setEmailing(false);
    }
  };

  const loadDemo = async () => {
    const res = await seedDemoWatchlist();
    toast.success(`Loaded ${res.added} demo theses`);
    await load();
  };

  const simulate = async () => {
    const res = await simulateSinceYouLeft();
    toast[res.ok ? 'success' : 'error'](res.ok ? `Simulated ${res.events} change events` : 'Add some stocks first');
    await load();
  };

  // --- selection -----------------------------------------------------------
  const toggleOne = (symbol: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
      return next;
    });
  // Select-all acts on the rows currently on screen, so merge/subtract rather
  // than replace — it must not silently drop a selection made under another view.
  const toggleAll = (symbols: string[], select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of symbols) select ? next.add(s) : next.delete(s);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const runBulk = async (fn: () => Promise<unknown>, msg: string) => {
    await fn();
    toast.success(msg);
    clearSelection();
    await load();
  };

  // Candidates vs positions: a watchlist is what you might buy, a portfolio is
  // what you own. They need different attention, so they're shown separately.
  const candidates = useMemo(() => (entries ?? []).filter((e) => !e.owned), [entries]);
  const positions = useMemo(() => (entries ?? []).filter((e) => e.owned), [entries]);

  // Bulk actions apply to `selected`, which is independent of what's rendered.
  // Narrowing the view would otherwise leave hidden rows armed for deletion.
  useEffect(() => {
    setSelected(new Set());
  }, [filter, tableView]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!.test;
    const list = candidates.filter(f);
    const byCatalyst = (e: WatchlistEntry) => e.catalystTradingDays ?? 9999;
    const byDistance = (e: WatchlistEntry) => (e.distanceToEntryPct == null ? 9999 : Math.abs(e.distanceToEntryPct));
    switch (sort) {
      case 'attention':
        return [...list].sort((a, b) => b.topUnseenSeverity - a.topUnseenSeverity || byDistance(a) - byDistance(b));
      case 'distance':
        return [...list].sort((a, b) => byDistance(a) - byDistance(b));
      case 'catalyst':
        return [...list].sort((a, b) => byCatalyst(a) - byCatalyst(b));
      case 'recent':
        return [...list].sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt));
      case 'az':
        return [...list].sort((a, b) => a.symbol.localeCompare(b.symbol));
      default:
        return list;
    }
  }, [candidates, filter, sort]);

  if (!deviceId || entries === null || digest === null) {
    return <div className="py-20 text-center text-gray-500">Loading your watchlist…</div>;
  }

  const showGroups = filter === 'all' && sort === 'category';
  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, items: filtered.filter((e) => e.category === cat) })).filter(
    (g) => g.items.length > 0
  );

  // --- watchlist averages ---------------------------------------------------
  const withChange = candidates.filter((e) => typeof e.changePercent === 'number');
  const avgChange = withChange.length
    ? withChange.reduce((s, e) => s + (e.changePercent as number), 0) / withChange.length
    : null;
  // Median, not mean — one 3,000× P/E outlier shouldn't define the list.
  const pes = candidates.map((e) => e.peRatio).filter((p): p is number => typeof p === 'number' && p > 0).sort((a, b) => a - b);
  const avgPe = pes.length
    ? pes.length % 2 ? pes[(pes.length - 1) / 2] : (pes[pes.length / 2 - 1] + pes[pes.length / 2]) / 2
    : null;
  const totalCap = candidates.reduce((s, e) => s + (e.marketCap ?? 0), 0);
  const nextCatalyst = candidates.map((e) => e.catalystTradingDays).filter((d): d is number => d != null).sort((a, b) => a - b)[0];

  const widthClass = prefs.fullWidth ? 'max-w-none' : layout === 'cards' ? 'max-w-3xl' : 'max-w-6xl';

  return (
    <div className={`mx-auto space-y-6 py-8 ${widthClass}`}>
      <div className="print:hidden"><IndexStrip /></div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Watchlist</h1>
          <p className="text-sm text-gray-500">
            {candidates.length} {candidates.length === 1 ? 'thesis' : 'theses'} in your research pipeline
            {positions.length > 0 && ` · ${positions.length} owned`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <div className="flex overflow-hidden rounded-md border border-gray-600">
            {([
              ['cards', LayoutGrid, 'Cards'],
              ['table', Table2, 'Table'],
              ['chart', LineChart, 'Chart'],
              ['history', History, 'History'],
            ] as const).map(
              ([v, Icon, label]) => (
                <button
                  key={v}
                  onClick={() => { setLayout(v); clearSelection(); }}
                  title={`${label} view`}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                    layout === v ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              )
            )}
          </div>
          <button
            onClick={emailDigest}
            disabled={emailing}
            className="inline-flex items-center gap-2 rounded-md border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:border-yellow-500 hover:text-yellow-500 disabled:opacity-50"
            title="Send yourself the change digest now"
          >
            <Mail className="h-4 w-4" /> {emailing ? 'Sending…' : 'Email me this'}
          </button>
          <button
            onClick={refreshNow}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:border-yellow-500 hover:text-yellow-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <WatchlistOptions entries={entries} prefs={prefs} setPref={setPref} resetPrefs={resetPrefs} onChanged={load} />
        </div>
      </div>

      {emailResult && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm print:hidden ${
            emailResult.ok
              ? 'border-green-500/30 bg-green-500/5 text-green-400'
              : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
          }`}
        >
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{emailResult.text}</span>
          <button onClick={() => setEmailResult(null)} className="text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="print:hidden">
        <SinceYouLeft digest={digest} deviceId={deviceId} onReviewed={load} onItemChange={load} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-600 print:hidden">
        <button onClick={loadDemo} className="rounded border border-gray-700 px-2 py-1 hover:border-gray-500 hover:text-gray-300">
          Load demo watchlist
        </button>
        <button onClick={simulate} className="rounded border border-gray-700 px-2 py-1 hover:border-gray-500 hover:text-gray-300">
          Simulate &ldquo;while you were away&rdquo;
        </button>
        <span className="self-center">— demo helpers; the real feed is driven by the 15-min poll</span>
      </div>

      <div className="print:hidden"><AddSymbol onAdded={load} /></div>

      {candidates.length === 0 && positions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center">
          <p className="text-gray-400">Your watchlist is empty.</p>
          <p className="mt-1 text-sm text-gray-600">
            Add a stock above. Give each one a one-sentence thesis, an entry zone, and an invalidation level —
            that&rsquo;s what makes &ldquo;meaningful change&rdquo; meaningful.
          </p>
        </div>
      ) : layout === 'chart' ? (
        <ChartView entries={filtered} onBack={() => setLayout('table')} />
      ) : layout === 'history' ? (
        <ChangeHistory reloadKey={dataVersion} />
      ) : (
        <>
          {/* column-view tabs (table layout only) */}
          {layout === 'table' && (
            <div className="flex flex-wrap items-center gap-1 border-b border-gray-700 print:hidden">
              {TABLE_VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setTableView(v.key)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
                    tableView === v.key
                      ? 'border-yellow-500 text-gray-100'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {FILTERS.map((f) => {
              const count = candidates.filter(f.test).length;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    filter === f.key
                      ? 'bg-yellow-500 text-gray-950'
                      : 'border border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {f.label}
                  {f.key !== 'all' && count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                </button>
              );
            })}
            {layout === 'cards' ? (
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="ml-auto rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>Sort: {s.label}</option>
                ))}
              </select>
            ) : (
              <span className="ml-auto text-xs text-gray-600">click a column header to sort</span>
            )}
          </div>

          {/* bulk-action toolbar */}
          {selected.size > 0 && layout === 'table' && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 print:hidden">
              <span className="text-sm text-gray-200">{selected.size} selected</span>
              <button
                onClick={() => runBulk(() => bulkSnooze([...selected], 7), `Muted ${selected.size} for 1 week`)}
                className="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-400"
              >
                <BellOff className="h-3 w-3" /> Mute 1wk
              </button>
              <select
                defaultValue=""
                onChange={(e) => {
                  const cat = e.target.value as WatchlistCategoryName;
                  if (!cat) return;
                  runBulk(() => bulkSetCategory([...selected], cat), `Moved ${selected.size} to ${CATEGORY_META[cat].label}`);
                  e.target.value = '';
                }}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-300"
              >
                <option value="">Move to…</option>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                ))}
              </select>
              <button
                onClick={() => runBulk(() => markThesisReviewed([...selected]), `Marked ${selected.size} reviewed`)}
                title="Reset the review clock — you've re-read the thesis and it still holds"
                className="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-400"
              >
                <Check className="h-3 w-3" /> Thesis reviewed
              </button>
              <button
                onClick={() => runBulk(() => Promise.all([...selected].map((s) => moveToPortfolio(s))), `Moved ${selected.size} to portfolio`)}
                title="You bought it — track it as a position, not a candidate"
                className="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-yellow-500 hover:text-yellow-500"
              >
                <Briefcase className="h-3 w-3" /> Move to portfolio
              </button>
              <button
                onClick={() => runBulk(() => bulkRemoveFromWatchlist([...selected]), `Removed ${selected.size} item(s)`)}
                className="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-red-500 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" /> Remove
              </button>
              <button onClick={clearSelection} className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-500">
              No items match this filter.
            </p>
          ) : layout === 'table' ? (
            <Reveal>
              <WatchlistTable
                entries={filtered}
                view={tableView}
                compact={prefs.compact}
                selected={selected}
                onToggle={toggleOne}
                onToggleAll={toggleAll}
              />
            </Reveal>
          ) : showGroups ? (
            grouped.map(({ cat, items }) => (
              <section key={cat} className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{CATEGORY_META[cat].label}</h2>
                  <span className="text-xs text-gray-600">{CATEGORY_META[cat].cadence}</span>
                </div>
                {items.map((entry, i) => (
                  <Reveal key={entry.symbol} delay={Math.min(i * 50, 250)}>
                    <WatchlistRow entry={entry} deviceId={deviceId} onChange={load} />
                  </Reveal>
                ))}
              </section>
            ))
          ) : (
            <div className="space-y-3">
              {filtered.map((entry, i) => (
                <Reveal key={entry.symbol} delay={Math.min(i * 50, 250)}>
                  <WatchlistRow entry={entry} deviceId={deviceId} onChange={load} />
                </Reveal>
              ))}
            </div>
          )}

          {/* Positions you actually own. Separated because owning changes the
              question from "should I buy?" to "does the thesis still hold?" */}
          {positions.length > 0 && (
            <Reveal>
              <section className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-gray-400">
                    <Briefcase className="h-4 w-4" /> Portfolio
                  </h2>
                  <span className="text-xs text-gray-600">
                    {positions.length} position{positions.length === 1 ? '' : 's'} · review the thesis, not the entry
                  </span>
                </div>
                {positions.map((entry, i) => (
                  <Reveal key={entry.symbol} delay={Math.min(i * 50, 250)}>
                    <div>
                      <WatchlistRow entry={entry} deviceId={deviceId} onChange={load} />
                      <div className="mt-1 flex justify-end print:hidden">
                        <button
                          onClick={async () => {
                            await returnToWatchlist(entry.symbol);
                            toast.success(`${entry.symbol} back on the watchlist`);
                            await load();
                          }}
                          className="rounded border border-gray-800 px-2 py-0.5 text-[11px] text-gray-600 hover:border-gray-600 hover:text-gray-300"
                        >
                          Sold — back to watchlist
                        </button>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </section>
            </Reveal>
          )}

          <Reveal>
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Watchlist averages</h2>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-700 bg-gray-700 sm:grid-cols-4">
                <Stat label="Avg 1D change" value={avgChange == null ? '—' : fmtPct(avgChange)}
                      tone={avgChange == null ? undefined : avgChange >= 0 ? 'up' : 'down'} />
                <Stat label="Combined market cap" value={fmtMarketCap(totalCap || null)} />
                <Stat label="Median P/E" value={avgPe == null ? '—' : avgPe.toFixed(1)} />
                <Stat label="Next catalyst" value={nextCatalyst == null ? '—' : `${nextCatalyst}d`}
                      tone={nextCatalyst != null && nextCatalyst <= 5 ? 'warn' : undefined} />
              </div>
            </section>
          </Reveal>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'warn' }) {
  const color =
    tone === 'up' ? 'text-green-500' : tone === 'down' ? 'text-red-500' : tone === 'warn' ? 'text-amber-400' : 'text-gray-100';
  return (
    <div className="bg-gray-800 p-4">
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
