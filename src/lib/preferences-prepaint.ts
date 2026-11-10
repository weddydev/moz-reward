/**
 * The part of the display preferences (src/lib/preferences.ts) that the server-rendered root layout needs:
 * storage keys, the <html> attribute and the inline pre-paint script. No React, no browser APIs at import.
 */
export const STORAGE_KEYS = {
  motion: "moz:motion",
  sound: "moz:sound",
  sync: "moz:prefs-sync",
} as const;

export const MOTION_ATTRIBUTE = "data-reduce-motion";

/**
 * Runs inline in <head> (with the CSP nonce) so the stored choice is on <html> before first paint. Kept tiny
 * and dependency-free; `applyMotionPreference` is the same rule for the hydrated page.
 */
export const PREPAINT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(STORAGE_KEYS.motion)});if(v==="reduce"||v==="full")document.documentElement.setAttribute(${JSON.stringify(MOTION_ATTRIBUTE)},v==="reduce"?"true":"false")}catch(e){}})()`;
