"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { reducedMotionNow } from "@/lib/motion/anim";
import { countUp, magneticOffset, ripple } from "@/lib/motion/press";
import { haptic } from "@/lib/haptics";

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
      if (e.button !== 0) return;
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
    for (const t of ["pointerup", "pointercancel", "pointerleave"] as const) el.addEventListener(t, up);
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

export function useMagnetic(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const move = (e: PointerEvent): void => {
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
  }, [ref]);
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Render the value as the element's only text (`{formatCount(value)}`); the hook counts it before paint. */
export function useCountUp(ref: RefObject<Element | null>, value: number, ms?: number): void {
  const last = useRef<number | null>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = last.current;
    last.current = value;
    if (from === null || from === value) return; // first render: the server-rendered text is already right
    return countUp(el, value, ms, from);
  }, [ref, value, ms]);
}
