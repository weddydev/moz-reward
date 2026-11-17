"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept in step as it changes (rotation, window resize). The server and the
 * first client render both report `serverValue`, so hydration never mismatches; the real value follows at once.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => {
        mql.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** DESIGN §5 desktop layout breakpoint (Tailwind `lg`). */
export const DESKTOP_QUERY = "(min-width: 1024px)";
