'use client';

import { useEffect, useState } from 'react';
import { recordVisit } from '@/lib/actions/watchlist.actions';

const STAMPED_KEY = 'sw:visit-stamped';
const PREV_KEY = 'sw:visit-previous';

/**
 * Stamps "you were here" once per tab session and returns when you were here
 * *before* that.
 *
 * Once per session, not once per mount, is the point. Moving between the
 * dashboard and the watchlist is one visit, and reloading the page is still the
 * same visit — otherwise "you last checked" collapses to "a few seconds ago"
 * the moment you click anything, which is true and useless.
 *
 * Returns null until the round trip lands; callers fall back to the digest's
 * own value so the copy is never blank.
 */
export function useRecordVisit(deviceId: string | null): string | null {
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) return;

    // sessionStorage throws outright in some privacy modes. Losing the guard
    // there just means the stamp moves more often — never a crash.
    let stamped = false;
    try {
      stamped = sessionStorage.getItem(STAMPED_KEY) === '1';
      if (stamped) {
        const cached = sessionStorage.getItem(PREV_KEY);
        setPrevious(cached || null);
      }
    } catch {
      /* ignore */
    }
    if (stamped) return;

    let live = true;
    recordVisit(deviceId)
      .then(({ previous: prev }) => {
        if (!live) return;
        setPrevious(prev);
        try {
          sessionStorage.setItem(STAMPED_KEY, '1');
          sessionStorage.setItem(PREV_KEY, prev ?? '');
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [deviceId]);

  return previous;
}
