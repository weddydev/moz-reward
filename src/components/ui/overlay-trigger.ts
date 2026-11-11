/**
 * Which control opened an overlay, so focus can return to it (P0-09 AC 3). Usually the focused element, but
 * Safari does not focus a button on a mouse click or tap, so the control clicked just now is preferred: a
 * capture-phase click listener (installed once, on first use) remembers it for a second.
 */
const FOCUSABLE = "button, a[href], input, select, textarea, summary, [tabindex]";
const RECENT_MS = 1000;

let last: { el: HTMLElement; at: number } | null = null;
let installed = false;

export function trackTriggers(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(FOCUSABLE) : null;
      last = el ? { el, at: performance.now() } : null;
    },
    { capture: true },
  );
}

export function currentTrigger(): HTMLElement | null {
  const recent =
    last && last.el.isConnected && performance.now() - last.at < RECENT_MS ? last.el : null;
  const active = document.activeElement;
  const focused = active instanceof HTMLElement && active !== document.body ? active : null;
  return recent ?? focused;
}
