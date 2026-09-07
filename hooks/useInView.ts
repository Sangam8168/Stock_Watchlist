'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fires once when the element scrolls into view. Pre-triggers a bit before the
 * element is visible, and has a safety timeout so content never stays hidden
 * (e.g. if you scroll past it fast, or the observer never fires).
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(rootMargin = '0px 0px 120px 0px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    obs.observe(el);

    // Last-resort guarantee that content is never left invisible.
    const fallback = setTimeout(() => setInView(true), 2500);
    return () => {
      obs.disconnect();
      clearTimeout(fallback);
    };
  }, [inView, rootMargin]);

  return { ref, inView };
}
