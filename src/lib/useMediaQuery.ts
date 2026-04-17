"use client";

import { useState, useEffect } from "react";

/**
 * SSR-safe media-query hook.
 * Returns `true` when the viewport matches the given query string.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** true when viewport < 768px (Tailwind `md` breakpoint) */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/** true when viewport is 768–1023px */
export function useIsTablet(): boolean {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}

/** true when viewport ≥ 1024px */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
