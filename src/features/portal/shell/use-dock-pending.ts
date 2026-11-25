"use client";

import { useState } from "react";
import type { PendingTap } from "./dock-placement";

/**
 * The dock's pending tap (PD-07): set when an item is tapped, dropped as soon as the route changes, so returning to
 * the tapping page (Android or browser Back) never brings an old tap back: the gold settles on the current page
 * until the next tap (code review HIGH-1, P1-B close). The drop happens during render (React's "adjust state when
 * a prop changes"), so the first frame on the new route already reads the settled column.
 */
export function useDockPending(pathname: string): [PendingTap | null, (column: number) => void] {
  const [pending, setPending] = useState<PendingTap | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  let current = pending;
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (pending) setPending(null);
    current = null;
  }
  const tap = (column: number): void => {
    setPending({ from: pathname, column });
  };
  return [current, tap];
}
