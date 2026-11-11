import type { NavType } from "./route-transitions";

/**
 * Which way the next page should slide in (P0-10). `TransitionLink` (or code before `router.push`) records
 * the direction and the page it points at; the page's `RouteContent` takes it once when that path renders.
 * A different path (second click won, browser back/forward) or a stale intent gets nothing: a plain fade,
 * never the wrong direction. Module state is fine: one document, one navigation at a time.
 */
export const NAV_INTENT_TTL_MS = 5000;

let intent: { path: string; type: NavType; at: number } | null = null;

export function setNavIntent(
  href: string,
  type: NavType,
  now = Date.now(),
  base = window.location.href,
): void {
  try {
    const url = new URL(href, base);
    intent = url.origin === new URL(base).origin ? { path: url.pathname, type, at: now } : null;
  } catch {
    intent = null;
  }
}

/** The direction for `pathname`, if the last recorded click pointed there; always clears it. */
export function takeNavIntent(pathname: string, now = Date.now()): NavType | null {
  const current = intent;
  intent = null;
  if (!current || current.path !== pathname || now - current.at > NAV_INTENT_TTL_MS) return null;
  return current.type;
}
