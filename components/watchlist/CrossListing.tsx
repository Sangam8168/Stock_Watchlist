'use client';

import { useState } from 'react';
import { Scale, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { checkCrossListing, type CrossListingCheck } from '@/lib/actions/yahoo.actions';
import { siblingListing } from '@/lib/changes/exchange';
import { fmtPrice } from '@/lib/changes/display';

/**
 * The same company, priced by two exchanges.
 *
 * This is the one place a genuinely independent second opinion exists. NSE and
 * BSE are separate order books for the same shares, so a gap between them is
 * real information rather than two vendors reselling one feed — which is what a
 * "multi-provider" check usually turns out to be.
 *
 * A small spread is just the bid-ask difference and is normal; a persistent wide
 * one usually means one venue's quote has gone stale. Either way the number on
 * screen deserves the caveat.
 *
 * Renders nothing for US listings, which have no sibling to compare against.
 */
export default function CrossListing({ symbol }: { symbol: string }) {
  const [res, setRes] = useState<CrossListingCheck | null>(null);
  const [loading, setLoading] = useState(false);

  const sibling = siblingListing(symbol);
  if (!sibling) return null;

  const load = async () => {
    setLoading(true);
    try {
      const r = await checkCrossListing(symbol);
      if (r) setRes(r);
      else toast.error('No second listing to compare against');
    } catch {
      toast.error('Could not reach the other exchange');
    } finally {
      setLoading(false);
    }
  };

  if (!res) {
    return (
      <button
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-white/25 hover:text-gray-200 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
        {loading ? 'Comparing…' : `Compare with ${sibling}`}
      </button>
    );
  }

  const venue = (s: string) => (s.endsWith('.NS') ? 'NSE' : s.endsWith('.BO') ? 'BSE' : s);

  return (
    <div className="surface-sunken">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Scale className="h-3.5 w-3.5" /> Both exchanges
      </p>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="text-sm">
          <span className="text-gray-500">{venue(res.primary)}</span>{' '}
          <span className="tabular-nums text-gray-200">{fmtPrice(res.primaryPrice, 'INR')}</span>
        </span>
        <span className="text-sm">
          <span className="text-gray-500">{venue(res.sibling)}</span>{' '}
          <span className="tabular-nums text-gray-200">{fmtPrice(res.siblingPrice, 'INR')}</span>
        </span>
        {res.divergencePct != null && (
          <span className={`text-sm tabular-nums ${res.diverged ? 'text-amber-400' : 'text-gray-500'}`}>
            {res.divergencePct.toFixed(2)}% apart
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-gray-600">
        {res.divergencePct == null
          ? 'One of the two venues did not return a price.'
          : res.diverged
            ? 'Wider than the usual bid-ask spread — one of these quotes is probably stale. Treat the number above with caution.'
            : 'Within the normal spread between the two books, so both quotes look trustworthy.'}
      </p>
    </div>
  );
}
