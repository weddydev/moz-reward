/**
 * Card → shop gold circle wipe (PD-08, DESIGN §7.3; reference "phone: wallet → shop"). Values verbatim from the
 * reference: the metal circle grows from the tap point for 620 ms, the shop follows in the same circle 110 ms
 * later, the wallet sinks to .92 at 40% opacity, 22 sparks fly from the tap at 80 ms, the shop's content rises
 * from 300 ms with a 60 ms stagger and its gold bar fills from 420 ms. Back closes the shop's circle onto the
 * back button in 520 ms while the wallet comes back 80 ms later. Reduced motion: a 150 ms fade, no circle.
 *
 * The tap and the arriving page are two renders apart (the card's click, then the shop's commit), so the tap
 * point is handed over like `nav-intent`: same origin, one path, short-lived module state, taken once.
 */
export const WIPE = {
  durationMs: 620,
  easing: "cubic-bezier(0.65,0,0.35,1)",
  shopDelayMs: 110,
  walletScale: 0.92,
  walletOpacity: 0.4,
  walletMs: 600,
  radiusFactor: 1.05,
  sparks: { count: 22, delayMs: 80, speed: [160, 420] as const },
  rise: { ms: 520, delayMs: 300, staggerMs: 60, fromPx: 22 },
  bar: { ms: 900, delayMs: 420 },
  back: { ms: 520, walletDelayMs: 80 },
  reducedFadeMs: 150,
  /** How long a tap stays valid for the page it pointed at (a slow network may take a while to commit). */
  ttlMs: 5000,
} as const;

export type Point = { x: number; y: number };

/** The circle that covers the whole stage from any point in it (reference `R()`). */
export function wipeRadius(width: number, height: number): number {
  return Math.hypot(width, height) * WIPE.radiusFactor;
}

const px = (n: number): string => `${String(Math.round(n * 10) / 10)}px`;

export function circleClip(r: number, x: number, y: number): string {
  return `circle(${px(r)} at ${px(x)} ${px(y)})`;
}

/** The content's k-th rising element's delay. */
export function riseDelay(k: number): number {
  return WIPE.rise.delayMs + k * WIPE.rise.staggerMs;
}

/** A delay counted from the tap, for an animation that starts `elapsed` ms after it. */
export function remainingDelay(delay: number, elapsed: number): number {
  return Math.max(0, delay - Math.max(0, elapsed));
}

/**
 * Where the wipe starts, relative to the stage (reference `pt()`): the pointer, or the card's centre for a
 * keyboard click (which reports 0, 0) or no event.
 */
export function wipePoint(
  event: { clientX: number; clientY: number } | null,
  card: { left: number; top: number; width: number; height: number },
  stage: { left: number; top: number },
): Point {
  if (event && (event.clientX || event.clientY)) {
    return { x: event.clientX - stage.left, y: event.clientY - stage.top };
  }
  return {
    x: card.left + card.width / 2 - stage.left,
    y: card.top + card.height / 2 - stage.top,
  };
}

let pending: { kind: "open" | "back"; path: string; point: Point; at: number } | null = null;

function record(kind: "open" | "back", href: string, point: Point, at: number, base: string): void {
  try {
    const url = new URL(href, base);
    pending = url.origin === new URL(base).origin ? { kind, path: url.pathname, point, at } : null;
  } catch {
    pending = null;
  }
}

/** Record a tap that started a wipe towards `href` (`at` on the `performance.now()` clock). */
export function setWipe(href: string, point: Point, at: number, base = window.location.href): void {
  record("open", href, point, at, base);
}

/** Record a back tap whose closing circle plays over the page, so `href` (the Wallet) returns instead of sliding. */
export function setWipeBack(href: string, at: number, base = window.location.href): void {
  record("back", href, { x: 0, y: 0 }, at, base);
}

/** The tap for `pathname`, if it is recent, with the ms already spent since it; doesn't clear it. */
export function peekWipe(pathname: string, now: number): (Point & { elapsed: number }) | null {
  if (
    !pending ||
    pending.kind !== "open" ||
    pending.path !== pathname ||
    now - pending.at > WIPE.ttlMs
  )
    return null;
  return { ...pending.point, elapsed: now - pending.at };
}

/** As `peekWipe`, and clears an open tap (a back token waits for `takeWipeBack`). */
export function takeWipe(pathname: string, now: number): (Point & { elapsed: number }) | null {
  const found = peekWipe(pathname, now);
  if (pending?.kind === "open") pending = null;
  return found;
}

/** The back token for `pathname`, if recent (ms since the tap); clears any token only when it matches. */
export function takeWipeBack(pathname: string, now: number): { elapsed: number } | null {
  if (!pending || pending.kind !== "back") return null;
  const ok = pending.path === pathname && now - pending.at <= WIPE.ttlMs;
  const elapsed = now - pending.at;
  pending = null;
  return ok ? { elapsed } : null;
}

export function clearWipe(): void {
  pending = null;
}
