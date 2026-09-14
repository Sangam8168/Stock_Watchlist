'use client';

import { useEffect, useState } from 'react';

const KEY = 'stockwatchlist.deviceId';

/**
 * Memoised for the lifetime of the tab. Without this, the storage-blocked path
 * below minted a *new* id on every call — and the hook is mounted by more than
 * one component (the nav badge and the watchlist page), so a private-mode user
 * got two different device ids. The badge and the page would then read different
 * watermarks and disagree about what was unseen, and every mount would insert
 * another SeenState row that nothing ever reads again.
 */
let cached: string | null = null;

function readOrCreate(): string {
  if (cached) return cached;
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return (cached = existing);
    const id =
      window.crypto?.randomUUID?.() ??
      `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(KEY, id);
    return (cached = id);
  } catch {
    // Private mode / storage blocked — one ephemeral id shared across the tab.
    return (cached = `d_ephemeral_${Math.random().toString(36).slice(2, 12)}`);
  }
}

/**
 * A stable id for *this browser*. The server keys "how far you've caught up" on
 * (user, deviceId), so your laptop and phone each track their own last-seen
 * position instead of one clearing the other's "new" badges.
 */
export function useDeviceId(): string | null {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    setDeviceId(readOrCreate());
  }, []);
  return deviceId;
}
