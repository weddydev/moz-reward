"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// Layout effects only run in the browser.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A request older than this no longer counts: the parent refused it (or answered something else). */
export const CHANGE_REQUEST_MS = 1000;

/**
 * Motion that answers the user's own change (PD-11; FOLLOWUPS 75/80): the event handler calls `request(next)`,
 * and `play(value)` runs from the layout effect that sees `value` become `next`. A controlled parent that refuses
 * the change gets no motion (nothing changes), and neither does a change the user didn't ask for (a template
 * filling a form, a reset). A request expires after `CHANGE_REQUEST_MS`, so a refused one can't fire later.
 */
export function useChangeMotion<T>(value: T, play: (value: T) => void): (next: T) => void {
  const shown = useRef(value);
  const wanted = useRef<{ value: T; at: number } | null>(null);
  const playRef = useRef(play);
  useBrowserLayoutEffect(() => {
    playRef.current = play;
  });
  useBrowserLayoutEffect(() => {
    const from = shown.current;
    shown.current = value;
    if (Object.is(from, value)) return;
    const w = wanted.current;
    wanted.current = null;
    if (!w || !Object.is(w.value, value) || performance.now() - w.at > CHANGE_REQUEST_MS) return;
    playRef.current(value);
  }, [value]);
  return (next) => {
    wanted.current = { value: next, at: performance.now() };
  };
}
