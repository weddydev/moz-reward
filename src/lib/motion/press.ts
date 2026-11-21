import { anim, reducedMotionNow } from "./anim";
import { burst } from "./fx";

/**
 * The press kit's DOM helpers (PD-03; reference `ripple`, `pressable`, `celebrate`, `countUp`). React hooks
 * over them live in `src/components/motion/press.ts`. Values are the reference's (DESIGN §7.4 Molten button).
 */
export const PRESS = {
  /** `.m-press.down` scale (molten.css) */
  scale: 0.93,
  rippleMs: 720,
  /** Ripple diameter = the element's longer side × this. */
  rippleSize: 2.4,
  magnetic: { x: 8, y: 6, kx: 0.1, ky: 0.25 },
  celebrate: {
    sparks: 28,
    sparkSpeed: [180, 520] as const,
    coins: 6,
    coinSpeed: [260, 520] as const,
    coinSpread: 1.6,
  },
  countUpMs: 700,
} as const;

const clamp = (a: number, b: number, v: number): number => Math.max(a, Math.min(b, v));

/** Pure: the magnetic lean for a pointer at (x, y) inside a w × h element, in px (±8 x, ±6 y). */
export function magneticOffset(
  x: number,
  y: number,
  w: number,
  h: number,
): { tx: number; ty: number } {
  const m = PRESS.magnetic;
  return {
    tx: Number(clamp(-m.x, m.x, (x - w / 2) * m.kx).toFixed(1)),
    ty: Number(clamp(-m.y, m.y, (y - h / 2) * m.ky).toFixed(1)),
  };
}

type PointLike = { clientX: number; clientY: number } | null | undefined;

/** The event's point, or the element's centre for a keyboard press (clientX/Y 0). */
function pointOf(el: Element, e: PointLike): [number, number] {
  if (e && (e.clientX || e.clientY)) return [e.clientX, e.clientY];
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

/** A gold ripple from the press point (720 ms ease-out); the element must clip it (`overflow: hidden`). */
export function ripple(el: HTMLElement, e?: PointLike): void {
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * PRESS.rippleSize;
  const [px, py] = pointOf(el, e);
  const s = document.createElement("span");
  s.className = "m-ripple";
  s.setAttribute("aria-hidden", "true");
  s.style.cssText = `width:${d}px;height:${d}px;left:${px - r.left - d / 2}px;top:${py - r.top - d / 2}px`;
  el.appendChild(s);
  const a = anim(
    s,
    [
      { transform: "scale(.04)", opacity: 1 },
      { transform: "scale(1)", opacity: 0 },
    ],
    { duration: PRESS.rippleMs },
  );
  if (a)
    a.onfinish = () => {
      s.remove();
    };
  else s.remove();
}

/** 28 sparks and (by default) 6 coins thrown up from the press point (no-op under reduced motion). */
export function celebrate(el: Element, e?: PointLike, coins: number = PRESS.celebrate.coins): void {
  const [cx, cy] = pointOf(el, e);
  const c = PRESS.celebrate;
  burst(cx, cy, { type: "spark", count: c.sparks, speed: c.sparkSpeed });
  if (coins)
    burst(cx, cy, {
      type: "coin",
      count: coins,
      speed: c.coinSpeed,
      angle: -Math.PI / 2,
      spread: c.coinSpread,
    });
}

/** en-GB whole numbers, as the reference's `fmt` (1,240). */
export const formatCount = (n: number): string => Math.round(n).toLocaleString("en-GB");

/** Pure: the count-up value at progress k (0..1), cubic ease-out like the reference. */
export function countUpAt(from: number, to: number, k: number): number {
  const t = clamp(0, 1, k);
  return from + (to - from) * (1 - Math.pow(1 - t, 3));
}

/**
 * Counts an element's text from `from` to `to` over `ms` (cubic out) with no React render per frame. When
 * the element holds one text node (React's), its value is written in place so React keeps its node.
 * Under reduced motion it shows `to` at once. Returns a cancel function that stops the frames, leaves the
 * number on screen and returns it, so an interrupted count can carry on from what the user sees.
 */
export function countUp(
  el: Element,
  to: number,
  ms: number = PRESS.countUpMs,
  from = 0,
): () => number {
  const only = el.childNodes.length === 1 ? el.firstChild : null;
  let shown = to;
  const show = (n: number): void => {
    shown = n;
    if (only && only.nodeType === Node.TEXT_NODE) only.nodeValue = formatCount(n);
    else el.textContent = formatCount(n);
  };
  if (reducedMotionNow() || ms <= 0) {
    show(to);
    return () => to;
  }
  show(from);
  const t0 = performance.now();
  let raf = 0;
  const frame = (now: number): void => {
    const k = (now - t0) / ms;
    show(countUpAt(from, to, k));
    raf = k < 1 ? requestAnimationFrame(frame) : 0;
  };
  raf = requestAnimationFrame(frame);
  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    return shown;
  };
}
