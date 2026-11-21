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
 * The one reduced-motion signal for script-driven motion (PD-03, like the reference's `<html class="rm">`):
 * on when the user chose "Reduce animations", or follows the system and the system asks for reduced motion.
 * The FX engine, `anim()` and the press kit read it; the CSS keeps the attribute + media query too, so pages
 * stay still even without JavaScript.
 */
export const RM_CLASS = "rm";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Runs inline in <head> (with the CSP nonce) so the stored choice is on <html> before first paint. Kept tiny
 * and dependency-free; `applyMotionPreference` is the same rule for the hydrated page.
 */
export const PREPAINT_SCRIPT = `(function(){var d=document.documentElement,v=null;try{v=localStorage.getItem(${JSON.stringify(STORAGE_KEYS.motion)})}catch(e){}if(v==="reduce"||v==="full")d.setAttribute(${JSON.stringify(MOTION_ATTRIBUTE)},v==="reduce"?"true":"false");try{if(v==="reduce"||(v!=="full"&&matchMedia(${JSON.stringify(QUERY)}).matches))d.classList.add(${JSON.stringify(RM_CLASS)})}catch(e){}})()`;
