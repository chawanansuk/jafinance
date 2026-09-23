'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Live value of a CSS media query. useSyncExternalStore rather than
 * useState + useEffect: the query is external state, and reading it this way
 * gives the right value on the first client render instead of a second pass.
 * The server snapshot is false — a static export has no media to query.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** The OS "reduce motion" setting. Charts and CountUp animate in JS, so the
 *  blanket CSS rule in globals.css can't reach them — they read this. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
