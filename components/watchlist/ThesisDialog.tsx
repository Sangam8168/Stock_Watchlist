'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { addToWatchlist, updateWatchlistItem } from '@/lib/actions/watchlist.actions';
import { getQuote } from '@/lib/actions/market-data.actions';
import { CATEGORY_META } from '@/lib/changes/display';

type Mode = 'add' | 'edit';

interface Props {
  symbol: string;
  company: string;
  mode: Mode;
  initial?: Partial<WatchlistEntry>;
  /** Uncontrolled usage: render this and the dialog opens on click. */
  trigger?: React.ReactNode;
  /** Controlled usage (pass both) — lets a parent own the open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDone?: () => void;
}

const CATEGORIES: WatchlistCategoryName[] = ['active', 'developing', 'longterm', 'earnings', 'speculative'];

/**
 * An emptied input must clear the stored value, so it travels as an explicit
 * `null` — `undefined` would be dropped from the update and silently keep the
 * old number. Matters most for invalidation: a level you can't delete keeps
 * firing "thesis broken" forever.
 */
const numOrNull = (v: FormDataEntryValue | null): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
};
const strOrNull = (v: FormDataEntryValue | null): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};


const num = (v: string): number | null => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};
const pctFrom = (price: number, level: number) => ((level - price) / price) * 100;
const money = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(2));

export default function ThesisDialog({
  symbol,
  company,
  mode,
  initial,
  trigger,
  open: openProp,
  onOpenChange,
  onDone,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setUncontrolledOpen(v);
    onOpenChange?.(v);
  };
  const [pending, startTransition] = useTransition();

  // Live quote so the levels can be reasoned about against the real price
  // instead of typed blind.
  const [quote, setQuote] = useState<number | null>(initial?.price ?? null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'done' | 'fail'>('idle');

  const [cat, setCat] = useState<WatchlistCategoryName>((initial?.category as WatchlistCategoryName) ?? 'developing');
  const [dir, setDir] = useState<'long' | 'short'>(initial?.direction === 'short' ? 'short' : 'long');
  const [lo, setLo] = useState(initial?.entryLow != null ? String(initial.entryLow) : '');
  const [hi, setHi] = useState(initial?.entryHigh != null ? String(initial.entryHigh) : '');
  const [inv, setInv] = useState(initial?.invalidationPrice != null ? String(initial.invalidationPrice) : '');
  const [tgt, setTgt] = useState(initial?.targetPrice != null ? String(initial.targetPrice) : '');

  useEffect(() => {
    if (!open || quote != null) return;
    setQuoteState('loading');
    getQuote(symbol)
      .then((q) => {
        if (typeof q.price === 'number' && q.price > 0) { setQuote(q.price); setQuoteState('done'); }
        else setQuoteState('fail');
      })
      .catch(() => setQuoteState('fail'));
  }, [open, symbol, quote]);

  /** One click fills a whole plan off the live price — the common case. */
  const suggest = () => {
    if (!quote) return;
    const s = dir === 'short' ? -1 : 1;
    setLo(money(quote * (1 - s * 0.07)));
    setHi(money(quote * (1 - s * 0.03)));
    setInv(money(quote * (1 - s * 0.15)));
    setTgt(money(quote * (1 + s * 0.25)));
  };

  // Live read-out: what these numbers actually commit you to.
  const plan = useMemo(() => {
    const L = num(lo), H = num(hi), I = num(inv), T = num(tgt);
    const entry = L != null && H != null ? (L + H) / 2 : (L ?? H);
    const warnings: string[] = [];
    if (L != null && H != null && H < L) warnings.push('Entry high is below entry low.');
    if (entry != null && I != null) {
      if (dir === 'long' && I >= entry) warnings.push('For a long, invalidation should sit below your entry.');
      if (dir === 'short' && I <= entry) warnings.push('For a short, invalidation should sit above your entry.');
    }
    if (entry != null && T != null) {
      if (dir === 'long' && T <= entry) warnings.push('For a long, target should sit above your entry.');
      if (dir === 'short' && T >= entry) warnings.push('For a short, target should sit below your entry.');
    }
    const risk = entry != null && I != null ? Math.abs((entry - I) / entry) * 100 : null;
    const reward = entry != null && T != null ? Math.abs((T - entry) / entry) * 100 : null;
    const rr = risk && reward && risk > 0 ? reward / risk : null;
    const away = quote != null && entry != null ? pctFrom(quote, entry) : null;
    return { entry, risk, reward, rr, away, warnings };
  }, [lo, hi, inv, tgt, dir, quote]);


  function onSubmit(formData: FormData) {
    const payload: AddWatchlistInput = {
      symbol,
      company,
      category: (formData.get('category') as WatchlistCategoryName) || 'developing',
      direction: (formData.get('direction') as 'long' | 'short') || 'long',
      thesis: strOrNull(formData.get('thesis')),
      entryLow: numOrNull(formData.get('entryLow')),
      entryHigh: numOrNull(formData.get('entryHigh')),
      invalidationPrice: numOrNull(formData.get('invalidationPrice')),
      targetPrice: numOrNull(formData.get('targetPrice')),
      catalystDate: strOrNull(formData.get('catalystDate')),
      catalystNote: strOrNull(formData.get('catalystNote')),
      notify: formData.get('notify') === 'on',
    };

    startTransition(async () => {
      try {
        const res =
          mode === 'add'
            ? await addToWatchlist(payload)
            : await updateWatchlistItem(symbol, payload);
        if (res.ok) {
          toast.success(mode === 'add' ? `${symbol} added with your thesis` : `${symbol} thesis updated`);
          setOpen(false);
          onDone?.();
        } else {
          const msg = 'error' in res && typeof res.error === 'string' ? res.error : 'Something went wrong';
          toast.error(msg);
        }
      } catch (e) {
        // The action throws rather than returning when the session has expired.
        // Without this the rejection was swallowed and the dialog just sat there,
        // which reads as "the button is broken".
        const msg = e instanceof Error ? e.message : '';
        toast.error(
          /auth/i.test(msg) ? 'Your session expired — please sign in again.' : `Could not save ${symbol}`,
          { description: msg || undefined, duration: 8000 }
        );
      }
    });
  }

  const field =
    'w-full h-10 px-3 rounded-md bg-gray-800/80 border border-gray-600 text-gray-100 text-sm outline-none ' +
    'transition-all duration-150 hover:border-gray-500 ' +
    'focus:border-yellow-500 focus:bg-gray-800 focus:ring-2 focus:ring-yellow-500/20';
  const labelCls = 'text-xs font-medium text-gray-400 mb-1 block';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="bg-gray-800 border-gray-600 text-gray-200 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-gray-100">
            {mode === 'add' ? `Add ${symbol}` : `Edit ${symbol} thesis`}
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            A watchlist item is a thesis, not just a ticker. &ldquo;Meaningful change&rdquo; is judged against these.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-3">
          {/* Live price anchor — levels are meaningless without it on screen. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-500">Trading now</span>
              <span className="text-lg font-semibold tabular-nums text-gray-100">
                {quote != null ? `$${quote.toFixed(2)}` : quoteState === 'loading' ? '…' : '—'}
              </span>
              {plan.away != null && (
                <span className="text-xs tabular-nums text-gray-500">
                  entry is {plan.away > 0 ? '+' : ''}{plan.away.toFixed(1)}% from here
                </span>
              )}
            </div>
            {quote != null && (
              <button
                type="button"
                onClick={suggest}
                className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 transition-colors hover:border-yellow-500 hover:text-yellow-500"
              >
                Suggest levels
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <input type="hidden" name="category" value={cat} />
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCat(c)}
                    title={CATEGORY_META[c].cadence}
                    className={`rounded-full px-2.5 py-1 text-xs transition-all duration-150 ${
                      cat === c
                        ? 'bg-yellow-500 font-medium text-gray-950'
                        : 'border border-gray-700 text-gray-400 hover:-translate-y-0.5 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    {CATEGORY_META[c].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Direction</label>
              <input type="hidden" name="direction" value={dir} />
              <div className="flex h-10 overflow-hidden rounded-md border border-gray-600">
                {(['long', 'short'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDir(d)}
                    className={`flex-1 text-sm font-medium transition-all duration-150 ${
                      dir === d
                        ? d === 'long'
                          ? 'bg-green-500/15 text-green-400 shadow-[inset_0_-2px_0_0_rgb(34,197,94)]'
                          : 'bg-red-500/15 text-red-400 shadow-[inset_0_-2px_0_0_rgb(239,68,68)]'
                        : 'text-gray-500 hover:bg-gray-700/40 hover:text-gray-300'
                    }`}
                  >
                    {d === 'long' ? 'Long ↑' : 'Short ↓'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>One-sentence thesis</label>
            <input
              name="thesis"
              defaultValue={initial?.thesis ?? ''}
              placeholder="e.g. Watching for a pullback to the 50-day as an add"
              maxLength={400}
              className={field}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Entry zone low ($)</label>
              <input name="entryLow" type="number" step="any" value={lo} onChange={(e) => setLo(e.target.value)} className={field} />
            </div>
            <div>
              <label className={labelCls}>Entry zone high ($)</label>
              <input name="entryHigh" type="number" step="any" value={hi} onChange={(e) => setHi(e.target.value)} className={field} />
            </div>
            <div>
              <label className={labelCls}>Invalidation ($)</label>
              <input
                name="invalidationPrice"
                type="number"
                step="any"
                value={inv}
                onChange={(e) => setInv(e.target.value)}
                placeholder={dir === 'short' ? 'thesis is wrong above' : 'thesis is wrong below'}
                className={field}
              />
            </div>
            <div>
              <label className={labelCls}>Target ($)</label>
              <input name="targetPrice" type="number" step="any" value={tgt} onChange={(e) => setTgt(e.target.value)} className={field} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Catalyst date</label>
              <input
                name="catalystDate"
                type="date"
                defaultValue={initial?.catalystDate ? initial.catalystDate.slice(0, 10) : ''}
                className={field}
              />
            </div>
            <div>
              <label className={labelCls}>Catalyst note</label>
              <input name="catalystNote" defaultValue={initial?.catalystNote ?? ''} placeholder="earnings, FDA…" className={field} />
            </div>
          </div>

          {/* Live plan visual — the bar redraws on every keystroke, so you can see
              the shape of the trade instead of reading four disconnected numbers. */}
          {quote != null && plan.entry != null && (
            <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
              <LiveMeter
                price={quote}
                low={num(lo)}
                high={num(hi)}
                invalidation={num(inv)}
                target={num(tgt)}
                short={dir === 'short'}
              />
            </div>
          )}

          {(plan.risk != null || plan.reward != null || plan.warnings.length > 0) && (
            <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-semibold tabular-nums text-red-400">
                    {plan.risk != null ? `−${plan.risk.toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-600">Risk to invalidation</div>
                </div>
                <div>
                  <div className="text-sm font-semibold tabular-nums text-green-500">
                    {plan.reward != null ? `+${plan.reward.toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-600">Reward to target</div>
                </div>
                <div>
                  <div className={`text-sm font-semibold tabular-nums ${plan.rr != null && plan.rr >= 2 ? 'text-green-500' : 'text-gray-300'}`}>
                    {plan.rr != null ? `${plan.rr.toFixed(1)}:1` : '—'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-600">Reward / risk</div>
                </div>
              </div>
              {plan.warnings.map((w) => (
                <p key={w} className="text-xs text-amber-400">⚠ {w}</p>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" name="notify" defaultChecked={initial?.notify ?? true} className="accent-yellow-500" />
            Include in alerts &amp; the &ldquo;while you were away&rdquo; digest
          </label>

          <DialogFooter>
            <Button type="submit" disabled={pending} className="yellow-btn px-6">
              {pending ? 'Saving…' : mode === 'add' ? 'Add to watchlist' : 'Save thesis'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


/**
 * Live version of ThesisMeter for the editor: takes raw field values rather
 * than a saved entry, so it animates while you type. Long reads
 * invalidation → entry band → target left-to-right; short mirrors it.
 */
function LiveMeter({
  price, low, high, invalidation, target, short,
}: {
  price: number;
  low: number | null;
  high: number | null;
  invalidation: number | null;
  target: number | null;
  short: boolean;
}) {
  const marks = [price, low, high, invalidation, target].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
  );
  if (marks.length < 2) return null;

  let lo = Math.min(...marks);
  let hi = Math.max(...marks);
  const pad = (hi - lo || hi || 1) * 0.1;
  lo -= pad;
  hi += pad;
  const span = hi - lo || 1;
  const at = (v: number) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));

  const danger = invalidation == null ? null
    : short ? { left: `${at(invalidation)}%`, right: '0%' } : { left: '0%', width: `${at(invalidation)}%` };
  const profit = target == null ? null
    : short ? { left: '0%', width: `${at(target)}%` } : { left: `${at(target)}%`, right: '0%' };

  return (
    <div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-gray-700">
        {danger && <div className="absolute inset-y-0 bg-red-500/40 transition-all duration-300" style={danger} />}
        {profit && <div className="absolute inset-y-0 bg-green-500/40 transition-all duration-300" style={profit} />}
        {low != null && high != null && high >= low && (
          <div
            className="absolute inset-y-0 rounded-full bg-yellow-500/80 transition-all duration-300"
            style={{ left: `${at(low)}%`, width: `${Math.max(at(high) - at(low), 1)}%` }}
          />
        )}
        <div
          className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-gray-100 transition-all duration-300"
          style={{ left: `${at(price)}%` }}
          title={`Now $${price.toFixed(2)}`}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums">
        <span className="text-red-400">{invalidation != null ? `$${invalidation}` : ''}</span>
        <span className="text-gray-400">now ${price.toFixed(2)}</span>
        <span className="text-green-500">{target != null ? `$${target}` : ''}</span>
      </div>
    </div>
  );
}
