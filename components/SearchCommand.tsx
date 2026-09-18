'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Loader2, Star, Clock, Flame, CornerDownLeft } from 'lucide-react';
import { toast } from 'sonner';
import { searchStocks } from '@/lib/actions/finnhub.actions';
import { getTrending, getMySymbols, type TrendingItem } from '@/lib/actions/discover.actions';
import { addToWatchlist, removeFromWatchlist } from '@/lib/actions/watchlist.actions';
import { useDebounce } from '@/hooks/useDebounce';

const RECENTS_KEY = 'sw:recent-symbols';
const MAX_RECENTS = 5;

type Recent = { symbol: string; name: string };

/** localStorage throws outright in some privacy modes — never let that kill the palette. */
function readRecents(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: Recent) {
  try {
    const next = [entry, ...readRecents().filter((r) => r.symbol !== entry.symbol)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* not important enough to surface */
  }
}

export default function SearchCommand({ renderAs = 'button', label = 'Add stock', initialStocks }: SearchCommandProps) {
  const router = useRouter();
  // Declared non-null, but the previous component guarded every use with `?.`
  // — searchStocks returns [] on failure and a caller can still pass undefined.
  // Normalise once here rather than re-guarding at each use site.
  const seed = initialStocks ?? [];
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [stocks, setStocks] = useState<StockWithWatchlistStatus[]>(seed);
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [recents, setRecents] = useState<Recent[]>([]);
  const [busySymbol, setBusySymbol] = useState<string | null>(null);

  const query = searchTerm.trim();
  const isSearchMode = !!query;

  // Responses can land out of order: fetchJSON retries a 429 with backoff, so a
  // request for "AAP" can easily outlive the one for "AAPL" typed after it and
  // overwrite the newer results. Only the latest request is allowed to write.
  const reqId = useRef(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Refresh context each time the palette opens — the watchlist may have
  // changed on another page (or another device) since it was last built.
  useEffect(() => {
    if (!open) return;
    setRecents(readRecents());
    let cancelled = false;
    (async () => {
      const [t, mine] = await Promise.all([getTrending(6), getMySymbols()]);
      if (cancelled) return;
      setTrending(t);
      setWatched(new Set(mine));
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSearch = async () => {
    if (!query) {
      reqId.current++; // cancel any in-flight write from a term now cleared
      setLoading(false);
      setStocks(seed);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    try {
      const results = await searchStocks(query);
      if (id !== reqId.current) return;
      setStocks(results);
    } catch {
      if (id === reqId.current) setStocks([]);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  const debouncedSearch = useDebounce(handleSearch, 300);

  useEffect(() => {
    debouncedSearch();
    // debouncedSearch is recreated each render; searchTerm is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const go = (symbol: string, name: string) => {
    pushRecent({ symbol, name });
    setOpen(false);
    setSearchTerm('');
    setStocks(seed);
    router.push(`/stocks/${symbol}`);
  };

  const toggleWatch = useCallback(
    async (symbol: string, company: string) => {
      const isWatched = watched.has(symbol);
      setBusySymbol(symbol);
      // Optimistic: the palette is a fast surface and a round-trip of dead time
      // makes the star feel broken. Rolled back below if the server disagrees.
      setWatched((prev) => {
        const next = new Set(prev);
        if (isWatched) next.delete(symbol);
        else next.add(symbol);
        return next;
      });
      try {
        // removeFromWatchlist returns no reason; addToWatchlist may. Widen to
        // the superset so both branches read the same way.
        const res: { ok: boolean; error?: string } = isWatched
          ? await removeFromWatchlist(symbol)
          : await addToWatchlist({ symbol, company, category: 'developing' });
        if (!res.ok) throw new Error(res.error || 'Could not update watchlist');
        toast.success(isWatched ? `${symbol} removed` : `${symbol} added — open it to add a thesis`);
      } catch (e) {
        setWatched((prev) => {
          const next = new Set(prev);
          if (isWatched) next.add(symbol);
          else next.delete(symbol);
          return next;
        });
        toast.error(e instanceof Error ? e.message : 'Could not update watchlist');
      } finally {
        setBusySymbol(null);
      }
    },
    [watched]
  );

  const StarToggle = ({ symbol, company }: { symbol: string; company: string }) => {
    const on = watched.has(symbol);
    return (
      <button
        aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
        disabled={busySymbol === symbol}
        onClick={(e) => {
          // The row is a cmdk item; without this the click also navigates.
          e.preventDefault();
          e.stopPropagation();
          void toggleWatch(symbol, company);
        }}
        className="shrink-0 rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-40"
      >
        <Star className={`h-4 w-4 ${on ? 'fill-yellow-500 text-yellow-500' : 'text-gray-600'}`} />
      </button>
    );
  };

  const Row = ({
    symbol,
    name,
    meta,
    right,
    icon,
    section,
  }: {
    symbol: string;
    name: string;
    meta?: string;
    right?: React.ReactNode;
    icon?: React.ReactNode;
    section: string;
  }) => (
    // value must be unique across sections — the same ticker can be both
    // recent and trending, and cmdk keys its selection by value.
    <CommandItem value={`${section}:${symbol}`} onSelect={() => go(symbol, name)} className="search-item">
      {icon ?? <span className="w-4" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-gray-200">
          <span className="font-semibold text-gray-100">{symbol}</span>
          <span className="ml-2 text-gray-500">{name}</span>
        </div>
        {meta && <div className="truncate text-xs text-gray-600">{meta}</div>}
      </div>
      {right}
      <StarToggle symbol={symbol} company={name} />
    </CommandItem>
  );

  const showEmpty = isSearchMode && !loading && stocks.length === 0;

  return (
    <>
      {renderAs === 'hidden' ? null : renderAs === 'text' ? (
        <span onClick={() => setOpen(true)} className="search-text">
          {label}
        </span>
      ) : (
        <Button onClick={() => setOpen(true)} className="search-btn">
          {label}
        </Button>
      )}

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} className="search-dialog">
        <div className="search-field">
          <CommandInput
            value={searchTerm}
            onValueChange={setSearchTerm}
            placeholder="Search by ticker or company name…"
            className="search-input"
          />
          {loading && <Loader2 className="search-loader" />}
        </div>

        <CommandList className="search-list">
          {showEmpty && (
            <CommandEmpty className="search-list-empty">
              Nothing matching “{query}”.
              <span className="mt-1 block text-xs text-gray-600">
                Foreign listings such as RELIANCE.NS are hidden — they have no live quote on this plan.
              </span>
            </CommandEmpty>
          )}

          {isSearchMode
            ? stocks.length > 0 && (
                <>
                  <div className="search-count">Results ({stocks.length})</div>
                  {stocks.map((s) => (
                    <Row
                      key={s.symbol}
                      section="result"
                      symbol={s.symbol}
                      name={s.name}
                      meta={`${s.exchange} · ${s.type}`}
                    />
                  ))}
                </>
              )
            : (
              <>
                {recents.length > 0 && (
                  <>
                    <div className="search-count">Recently viewed</div>
                    {recents.map((r) => (
                      <Row
                        key={r.symbol}
                        section="recent"
                        symbol={r.symbol}
                        name={r.name}
                        icon={<Clock className="h-4 w-4 text-gray-600" />}
                      />
                    ))}
                  </>
                )}

                {/* Watcher counts come from this app's own users, not a vendor
                    feed — honest on day one, and it costs zero API calls. */}
                {trending.length > 0 ? (
                  <>
                    <div className="search-count">Most watched here</div>
                    {trending.map((t) => (
                      <Row
                        key={t.symbol}
                        section="trending"
                        symbol={t.symbol}
                        name={t.company}
                        meta={`${t.watchers} watching`}
                        icon={<Flame className="h-4 w-4 text-gray-600" />}
                        right={
                          t.price != null ? (
                            <div className="shrink-0 text-right">
                              <div className="text-sm tabular-nums text-gray-300">${t.price.toFixed(2)}</div>
                              {t.changePercent != null && (
                                <div
                                  className={`text-xs tabular-nums ${t.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}
                                >
                                  {t.changePercent >= 0 ? '+' : ''}
                                  {t.changePercent.toFixed(2)}%
                                </div>
                              )}
                            </div>
                          ) : null
                        }
                      />
                    ))}
                  </>
                ) : (
                  <>
                    <div className="search-count">Popular stocks</div>
                    {seed.map((s) => (
                      <Row key={s.symbol} section="seed" symbol={s.symbol} name={s.name} meta={s.exchange} />
                    ))}
                  </>
                )}
              </>
            )}
        </CommandList>

        <div className="flex items-center gap-4 border-t hairline px-4 py-2 text-[11px] text-gray-600">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-white/5 px-1">↑</kbd>
            <kbd className="rounded bg-white/5 px-1">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> open
          </span>
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3" /> add without leaving
          </span>
        </div>
      </CommandDialog>
    </>
  );
}
