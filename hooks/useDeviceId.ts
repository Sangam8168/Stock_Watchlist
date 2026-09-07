'use client';

import { useEffect, useState } from 'react';

const KEY = 'stockwatchlist.deviceId';

function readOrCreate(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id =
      window.crypto?.randomUUID?.() ??
      `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode / storage blocked — fall back to a per-tab id.
    return `d_ephemeral_${Math.random().toString(36).slice(2, 12)}`;
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
