'use client';

import React, { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Star, Trash2 } from 'lucide-react';
import ThesisDialog from '@/components/watchlist/ThesisDialog';
import { addToWatchlist, removeFromWatchlist } from '@/lib/actions/watchlist.actions';

interface Props {
  symbol: string;
  company: string;
  isInWatchlist: boolean;
  showTrashIcon?: boolean;
  type?: 'button' | 'icon';
  onWatchlistChange?: (symbol: string, isAdded: boolean) => void;
}

const WatchlistButton = ({
  symbol,
  company,
  isInWatchlist,
  showTrashIcon = false,
  type = 'button',
  onWatchlistChange,
}: Props) => {
  const [added, setAdded] = useState(isInWatchlist);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      await removeFromWatchlist(symbol);
      setAdded(false);
      onWatchlistChange?.(symbol, false);
      toast.success(`${symbol} removed from watchlist`);
    });

  const quickAdd = () =>
    startTransition(async () => {
      const res = await addToWatchlist({ symbol, company, category: 'developing' });
      if (res.ok) {
        setAdded(true);
        onWatchlistChange?.(symbol, true);
        toast.success(`${symbol} added — set a thesis to make change detection sharper`);
      } else {
        toast.error(res.error || 'Could not add');
      }
    });

  if (type === 'icon') {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={added ? remove : quickAdd}
        title={added ? `Remove ${symbol}` : `Add ${symbol}`}
        aria-label={added ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
        className="watchlist-icon-btn"
      >
        <Star className="h-5 w-5" fill={added ? '#FACC15' : 'none'} stroke="#FACC15" />
      </button>
    );
  }

  if (added) {
    return (
      <button className="watchlist-btn watchlist-remove" onClick={remove} disabled={pending}>
        {showTrashIcon && <Trash2 className="w-4 h-4 mr-2" />}
        <span>{pending ? 'Removing…' : 'Remove from Watchlist'}</span>
      </button>
    );
  }

  return (
    <ThesisDialog
      symbol={symbol}
      company={company}
      mode="add"
      onDone={() => {
        setAdded(true);
        onWatchlistChange?.(symbol, true);
      }}
      trigger={
        <button className="watchlist-btn" disabled={pending}>
          <span>Add to Watchlist</span>
        </button>
      }
    />
  );
};

export default WatchlistButton;
