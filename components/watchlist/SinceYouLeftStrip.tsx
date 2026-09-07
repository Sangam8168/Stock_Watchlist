'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useDeviceId } from '@/hooks/useDeviceId';
import { getSinceYouLeft } from '@/lib/actions/watchlist.actions';
import { timeAgo } from '@/lib/changes/display';

export default function SinceYouLeftStrip() {
  const deviceId = useDeviceId();
  const [digest, setDigest] = useState<SinceYouLeftDigest | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    getSinceYouLeft(deviceId).then(setDigest).catch(() => setDigest(null));
  }, [deviceId]);

  if (!digest || digest.counts.itemsTracked === 0) return null;

  const { counts, groups, lastVisit } = digest;
  const quiet = counts.unseenEvents === 0;

  return (
    <Link
      href="/watchlist"
      className="group flex w-full items-center justify-between gap-4 rounded-xl border border-gray-700 bg-gray-800/60 p-4 hover:border-yellow-500/50"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-200">
          {quiet
            ? `Watchlist quiet since ${lastVisit ? timeAgo(lastVisit) : 'your last visit'}`
            : `${counts.unseenEvents} update${counts.unseenEvents === 1 ? '' : 's'} across ${groups.length} name${groups.length === 1 ? '' : 's'} since ${lastVisit ? timeAgo(lastVisit) : 'your last visit'}`}
        </p>
        {!quiet && (
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {counts.invalidated > 0 && <span className="text-red-400">{counts.invalidated} invalidated · </span>}
            {counts.needsAttention > 0 && <span className="text-amber-400">{counts.needsAttention} need attention · </span>}
            {groups[0]?.events[0]?.title}
          </p>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-sm text-yellow-500">
        Open <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
