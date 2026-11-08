import { useSyncExternalStore } from "react";

/**
 * Reduced motion = system `prefers-reduced-motion`, overridden by the user's choice in Me
 * ("Reduce animations"). The choice is mirrored to `<html data-motion>` so CSS tokens follow it.
 */
export type MotionPreference = "system" | "reduce" | "full";

const STORAGE_KEY = "moz:motion";
const QUERY = "(prefers-reduced-motion: reduce)";
const listeners = new Set<() => void>();

export function readMotionPreference(): MotionPreference {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "reduce" || v === "full" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyMotionPreference(pref: MotionPreference = readMotionPreference()): void {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.motion;
  else root.dataset.motion = pref;
}

export function setMotionPreference(pref: MotionPreference): void {
  try {
    if (pref === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* storage blocked: still apply for this page */
  }
  applyMotionPreference(pref);
  listeners.forEach((l) => {
    l();
  });
}

/** Pure decision, exported for tests. */
export const resolveReducedMotion = (pref: MotionPreference, systemReduce: boolean): boolean =>
  pref === "reduce" || (pref === "system" && systemReduce);

export function isReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return resolveReducedMotion(readMotionPreference(), window.matchMedia(QUERY).matches);
}

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  listeners.add(onChange);
  return () => {
    mql.removeEventListener("change", onChange);
    listeners.delete(onChange);
  };
}

/** true when animations should show their end state (≤150ms fades only). SSR assumes reduced. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReducedMotion, () => true);
}
