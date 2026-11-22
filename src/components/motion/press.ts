"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { haptic } from "@/lib/haptics";
import { reducedMotionNow } from "@/lib/motion/anim";
import { countUp, magneticOffset, ripple } from "@/lib/motion/press";

/**
 * Press kit hooks (PD-03; DESIGN §7.4, §7.5, §10). The element carries `className="m-press"` (molten.css):
 *
 * - `usePress(ref, { ripple, haptic })`: `.down` while pressed (scale .93 on the reference spring), released
 *   on up / cancel / leave; optional gold ripple from the press point; optional 12 ms press haptic on click
 *   (Android; a no-op elsewhere and with sounds and haptics off). Never blocks the click itself.
 * - `useMagnetic(ref)`: fine pointers only, leans ±8 px x / ±6 px y toward the pointer and exposes --mx/--my
 *   for a pointer highlight; nothing on touch or under reduced motion (the highlight still follows).
 * - `useCountUp(ref, value, ms)`: counts the element's text to each new value (cubic out, 700 ms), from the
 *   previous one; under reduced motion the new value shows at once.
 */
/** A control that can't act now (disabled or busy) neither presses, ripples nor leans (PD-04 design review). */
const inert = (el: Element): boolean =>
  el.matches(':disabled, [aria-busy="true"], [aria-disabled="true"]');

export function usePress(
  ref: RefObject<HTMLElement | null>,
  opts: { ripple?: boolean; haptic?: boolean } = {},
): void {
  const withRipple = opts.ripple === true;
  const withHaptic = opts.haptic === true;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const down = (e: PointerEvent): void => {
      if (e.button !== 0 || inert(el)) return;
      el.classList.add("down");
      if (withRipple) ripple(el, e);
    };
    const up = (): void => {
      el.classList.remove("down");
    };
    const click = (): void => {
      if (withHaptic) haptic("press");
    };
    el.addEventListener("pointerdown", down);
    for (const t of ["pointerup", "pointercancel", "pointerleave"] as const)
      el.addEventListener(t, up);
    el.addEventListener("click", click);
    return () => {
      el.removeEventListener("pointerdown", down);
      for (const t of ["pointerup", "pointercancel", "pointerleave"] as const)
        el.removeEventListener(t, up);
      el.removeEventListener("click", click);
      el.classList.remove("down");
    };
  }, [ref, withRipple, withHaptic]);
}

export function useMagnetic(
  ref: RefObject<HTMLElement | null>,
  opts: { enabled?: boolean } = {},
): void {
  const enabled = opts.enabled !== false;
  useEffect(() => {
    const el = ref.current;
    if (
      !enabled ||
      !el ||
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    )
      return;
    const move = (e: PointerEvent): void => {
      if (inert(el)) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      if (reducedMotionNow()) return;
      const { tx, ty } = magneticOffset(x, y, r.width, r.height);
      el.style.setProperty("--tx", `${tx.toFixed(1)}px`);
      el.style.setProperty("--ty", `${ty.toFixed(1)}px`);
    };
    const leave = (): void => {
      el.style.setProperty("--tx", "0px");
      el.style.setProperty("--ty", "0px");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      leave();
    };
  }, [ref, enabled]);
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Render the value as the element's only text (`{formatCount(value)}`); the hook counts it before paint. With
 * `start`, the first render counts from it too (a tab panel's number counts from 0 each time it is shown);
 * without, the first render shows the value as rendered (the server's text is already right).
 */
export function useCountUp(
  ref: RefObject<Element | null>,
  value: number,
  ms?: number,
  start?: number,
): void {
  // The number on screen: the last target, or where an interrupted count stopped.
  const shown = useRef<number | null>(start ?? null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    shown.current = value;
    if (from === null || from === value) return; // first render without `start`: the rendered text is right
    const cancel = countUp(el, value, ms, from);
    return () => {
      shown.current = cancel();
    };
  }, [ref, value, ms]);
}
