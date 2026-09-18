'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { searchStocks } from '@/lib/actions/finnhub.actions';
import { getQuote } from '@/lib/actions/market-data.actions';
import { addToWatchlist } from '@/lib/actions/watchlist.actions';
import { useDebounce } from '@/hooks/useDebounce';

/**
 * First-run walkthrough: one real thesis, on a stock the user actually cares
 * about, with the reasoning explained as they type it.
 *
 * "Load demo data" shows what the app looks like full. It does not teach what an
 * invalidation level *is*, and that is the one concept everything else depends
 * on — get it wrong and every alert afterwards is wrong. So this asks the four
 * questions in plain language, one at a time, against a live price.
 */
type Step = 'pick' | 'entry' | 'invalidation' | 'target';

const ORDER: Step[] = ['pick', 'entry', 'invalidation', 'target'];

export default function GuidedFirstThesis({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState<Step>('pick');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<StockWithWatchlistStatus[]>([]);
  const [picked, setPicked] = useState<{ symbol: string; name: string } | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [entry, setEntry] = useState('');
  const [inv, setInv] = useState('');
  const [tgt, setTgt] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!term.trim()) return setResults([]);
    setResults(await searchStocks(term.trim()));
  };
  const search = useDebounce(run, 300);
  useEffect(() => { search(); }, [term]);
  useEffect(() => { inputRef.current?.focus(); }, [step]);

  const choose = async (symbol: string, name: string) => {
    setPicked({ symbol, name });
    setStep('entry');
    const q = await getQuote(symbol).catch(() => null);
    if (q?.price) {
      setPrice(q.price);
      // Seed a sensible starting point so the field is never a blank stare.
      setEntry(q.price.toFixed(2));
    }
  };

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const save = async () => {
    if (!picked) return;
    const e = num(entry);
    setSaving(true);
    try {
      const res = await addToWatchlist({
        symbol: picked.symbol,
        company: picked.name,
        category: 'active',
        direction: 'long',
        // A single price becomes a small band — the engine detects entry into a
        // zone, and nobody buys at one exact number.
        entryLow: e ? Number((e * 0.98).toFixed(2)) : null,
        entryHigh: e,
        invalidationPrice: num(inv),
        targetPrice: num(tgt),
        notify: true,
      });
      if (res.ok) {
        toast.success(`${picked.symbol} added — you'll hear from us when it moves against this plan`);
        onDone();
      } else {
        toast.error(res.error || 'Could not add that');
      }
    } finally {
      setSaving(false);
    }
  };

  const idx = ORDER.indexOf(step);
  const back = () => setStep(ORDER[Math.max(0, idx - 1)]);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {ORDER.map((s, i) => (
            <span key={s} className={`h-1 w-8 rounded-full ${i <= idx ? 'bg-yellow-500' : 'bg-gray-700'}`} />
          ))}
        </div>
        <button onClick={onSkip} className="text-xs text-gray-600 hover:text-gray-400">
          I&rsquo;ll do it myself
        </button>
      </div>

      {step === 'pick' && (
        <>
          <h2 className="text-lg font-semibold text-gray-100">Pick a stock you actually follow</h2>
          <p className="mt-1 text-sm text-gray-500">
            Not a demo ticker — something you have an opinion about. The whole point is that the
            alerts are judged against <em>your</em> reasoning.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-gray-600 bg-gray-800 px-3">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search by symbol or name…"
              className="h-10 flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-600"
            />
          </div>
          {results.length > 0 && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-gray-700">
              {results.map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => choose(r.symbol, r.name)}
                  className="flex w-full items-center justify-between border-b border-gray-800 px-3 py-2 text-left last:border-0 hover:bg-gray-700/50"
                >
                  <span className="text-sm font-medium text-gray-100">{r.symbol}</span>
                  <span className="truncate pl-3 text-xs text-gray-500">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step !== 'pick' && picked && (
        <>
          <p className="text-xs uppercase tracking-wide text-gray-600">
            {picked.symbol} · {price != null ? `trading at $${price.toFixed(2)}` : 'loading price…'}
          </p>

          {step === 'entry' && (
            <Question
              title="What price would you actually buy at?"
              why="Most people say a stock is “too expensive” without saying what cheap would look like. Writing it down is what lets the app tell you when it arrives — instead of you checking every day."
              value={entry}
              onChange={setEntry}
              hint={price ? `It's $${price.toFixed(2)} now. Under it means you're waiting for a dip.` : undefined}
              inputRef={inputRef}
            />
          )}

          {step === 'invalidation' && (
            <Question
              title="At what price would you change your mind?"
              why="This is the one that matters. When a stock falls, the natural instinct is “even cheaper now” — which is how people ride something all the way down. Choosing the number in advance, while you're calm, is the whole discipline."
              value={inv}
              onChange={setInv}
              hint={entry ? `Below your $${entry} buy price. Far enough to survive noise, close enough to mean something.` : undefined}
              inputRef={inputRef}
            />
          )}

          {step === 'target' && (
            <Question
              title="Where would you take the profit?"
              why="Decided now, while you have no position and no excitement. Optional — but without it, “when do I sell?” gets answered by whatever you're feeling that day."
              value={tgt}
              onChange={setTgt}
              hint="You can leave this blank and add it later."
              inputRef={inputRef}
            />
          )}

          <div className="mt-5 flex items-center justify-between">
            <button onClick={back} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {step === 'target' ? (
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-gray-950 hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Done — start watching'}
              </button>
            ) : (
              <button
                onClick={() => setStep(ORDER[idx + 1])}
                className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-gray-950 hover:opacity-90"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Question({
  title, why, value, onChange, hint, inputRef,
}: {
  title: string; why: string; value: string; onChange: (v: string) => void;
  hint?: string; inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="mt-3">
      <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{why}</p>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-lg text-gray-600">$</span>
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-40 rounded-md border border-gray-600 bg-gray-800 px-3 text-lg tabular-nums text-gray-100 outline-none transition-all focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20"
        />
      </div>
      {hint && <p className="mt-2 text-xs text-gray-600">{hint}</p>}
    </div>
  );
}
