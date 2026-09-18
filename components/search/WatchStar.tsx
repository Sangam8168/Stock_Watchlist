'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { addToWatchlist, removeFromWatchlist } from '@/lib/actions/watchlist.actions';

/**
 * Add/remove without leaving the page. Optimistic, because a round trip of dead
 * time on a star makes it feel broken — rolled back if the server disagrees.
 */
export default function WatchStar({
  symbol,
  company,
  initial,
}: {
  symbol: string;
  company: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const was = on;
    setOn(!was);
    setBusy(true);
    try {
      const res: { ok: boolean; error?: string } = was
        ? await removeFromWatchlist(symbol)
        : await addToWatchlist({ symbol, company, category: 'developing' });
      if (!res.ok) throw new Error(res.error || 'Could not update watchlist');
      toast.success(was ? `${symbol} removed` : `${symbol} added — open it to set your levels`);
    } catch (e) {
      setOn(was);
      toast.error(e instanceof Error ? e.message : 'Could not update watchlist');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      className="shrink-0 rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-40"
    >
      <Star className={`h-4 w-4 ${on ? 'fill-yellow-500 text-yellow-500' : 'text-gray-600'}`} />
    </button>
  );
}
