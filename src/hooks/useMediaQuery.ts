/**
 * useMediaQuery — Responsive design hook (#12)
 * ==============================================
 * SSR-safe media query hook for responsive component behavior.
 *
 * Usage:
 *   const isMobile = useMediaQuery("(max-width: 768px)");
 */

"use client";

import { useState, useEffect } from "react";

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
