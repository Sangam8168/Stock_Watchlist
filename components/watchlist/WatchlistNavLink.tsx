'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDeviceId } from '@/hooks/useDeviceId';
import { getUnseenCount } from '@/lib/actions/watchlist.actions';

/** Fired by any surface that advances a seen-watermark, so the badge can requery. */
export const SEEN_CHANGED_EVENT = 'watchlist:seen-changed';
export const notifySeenChanged = () => window.dispatchEvent(new Event(SEEN_CHANGED_EVENT));

export default function WatchlistNavLink() {
  const pathname = usePathname();
  const deviceId = useDeviceId();
  const [unseen, setUnseen] = useState(0);

  useEffect(() => {
    if (!deviceId) return;
    const refresh = () => {
      getUnseenCount(deviceId)
        .then(setUnseen)
        .catch(() => {});
    };
    refresh();
    // Marking things reviewed happens on the watchlist page, which never
    // navigates — without this the badge would stay stale until you left.
    window.addEventListener(SEEN_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SEEN_CHANGED_EVENT, refresh);
  }, [deviceId, pathname]);

  const active = pathname.startsWith('/watchlist');

  return (
    <Link
      href="/watchlist"
      className={`relative hover:text-yellow-500 transition-colors ${active ? 'text-gray-100' : ''}`}
    >
      Watchlist
      {unseen > 0 && (
        <span className="absolute -right-3 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-gray-950">
          {unseen > 9 ? '9+' : unseen}
        </span>
      )}
    </Link>
  );
}
