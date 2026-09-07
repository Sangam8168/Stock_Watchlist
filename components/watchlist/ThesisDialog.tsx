'use client';

import { useState, useTransition } from 'react';
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
    });
  }

  const field = 'w-full h-10 px-3 rounded-md bg-gray-800 border border-gray-600 text-gray-100 text-sm focus:border-yellow-500 outline-none';
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <select name="category" defaultValue={initial?.category ?? 'developing'} className={field}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Direction</label>
              <select name="direction" defaultValue={initial?.direction ?? 'long'} className={field}>
                <option value="long">Long (target above)</option>
                <option value="short">Short (target below)</option>
              </select>
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
              <input name="entryLow" type="number" step="any" defaultValue={initial?.entryLow ?? ''} className={field} />
            </div>
            <div>
              <label className={labelCls}>Entry zone high ($)</label>
              <input name="entryHigh" type="number" step="any" defaultValue={initial?.entryHigh ?? ''} className={field} />
            </div>
            <div>
              <label className={labelCls}>Invalidation ($)</label>
              <input
                name="invalidationPrice"
                type="number"
                step="any"
                defaultValue={initial?.invalidationPrice ?? ''}
                placeholder="thesis is wrong below"
                className={field}
              />
            </div>
            <div>
              <label className={labelCls}>Target ($)</label>
              <input name="targetPrice" type="number" step="any" defaultValue={initial?.targetPrice ?? ''} className={field} />
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
