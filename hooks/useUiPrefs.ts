'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UiPrefs {
  animations: boolean;
  realtime: boolean;   // auto-refresh the list on an interval
  fullWidth: boolean;
  compact: boolean;    // denser table rows
}

const DEFAULTS: UiPrefs = { animations: true, realtime: false, fullWidth: false, compact: false };
const KEY = 'stockwatchlist.uiPrefs';

/** Persisted per-browser UI preferences (Options menu). */
export function useUiPrefs() {
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* storage blocked — defaults are fine */
    }
    setReady(true);
  }, []);

  // Animations are switched off with a root class so CSS can kill every
  // transition/keyframe at once, including ones inside child components.
  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle('no-anim', !prefs.animations);
  }, [prefs.animations, ready]);

  const set = useCallback(<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setPrefs(DEFAULTS);
  }, []);

  return { prefs, set, reset, ready };
}
