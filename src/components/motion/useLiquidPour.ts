"use client";

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import {
  blobKeyframes,
  dropKeyframes,
  LIQUID,
  type LiquidAxis,
  type Slot,
} from "@/lib/motion/controls";

// Layout effects only run in the browser; the server render places the blob with CSS alone.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The element's running animations ([] where Web Animations are missing, e.g. jsdom). */
export const animationsOf = (el: Element | null | undefined): Animation[] =>
  el && typeof el.getAnimations === "function" ? el.getAnimations() : [];

/**
 * An item's slot from its layout box (offsets from the group's padding box, like the reference's `geom`): left
 * and width in a row, top and height in a column.
 */
export const slotOf = (o: HTMLElement, axis: LiquidAxis = "x"): Slot => {
  const x = axis === "x" ? o.offsetLeft : o.offsetTop;
  const w = axis === "x" ? o.offsetWidth : o.offsetHeight;
  return { x, w, c: x + w / 2 };
};

/**
 * The liquid gold of a group (PD-05 liquid choice, PD-07 dock and rail; reference `liquid()`): puts the blob and
 * its droplets on item `index` at first paint, pours them across when `index` changes (660 ms stretch-overshoot-
 * settle, droplets 760 ms after 90 / 170 ms), carries a pour on from where the gold is when the choice changes
 * mid-pour (never queues), and snaps to the new box when the group is resized. Reduced motion moves the gold at
 * once. `index` < 0 means nothing is chosen: the gold stays where it was (the caller hides it).
 *
 * `items()` returns the items in order; their boxes must be measured from the same padding box the goo layer
 * covers (the group is their offsetParent). In a column (`axis` "y") the hook sets the blob's height and
 * vertical place; its width comes from CSS.
 */
export function useLiquidPour({
  rootRef,
  blobRef,
  dropsRef,
  items,
  index,
  axis = "x",
}: {
  rootRef: RefObject<HTMLElement | null>;
  blobRef: RefObject<HTMLElement | null>;
  dropsRef: RefObject<Array<HTMLElement | null>>;
  items: () => ReadonlyArray<HTMLElement | null | undefined>;
  index: number;
  axis?: LiquidAxis;
}): void {
  const placed = useRef<number | null>(null);
  const size = useRef("");
  const itemsRef = useRef(items);
  // Before the placing effect below (effects run in order), so it always measures this render's items.
  useBrowserLayoutEffect(() => {
    itemsRef.current = items;
  });
  const size1 = axis === "x" ? "width" : "height";
  const pos0 = axis === "x" ? "left" : "top";
  const translate = axis === "x" ? "translateX" : "translateY";

  /** Puts the gold on item `i` with no motion (pixel geometry from here on, like the reference). */
  const place = useCallback(
    (i: number): void => {
      const o = itemsRef.current()[i];
      const b = blobRef.current;
      if (!o || !b) return;
      const s = slotOf(o, axis);
      b.style.setProperty(size1, `${String(s.w)}px`);
      b.style.transform = `${translate}(${String(s.x)}px)`;
      dropsRef.current.forEach((d) => {
        if (!d) return;
        d.style.setProperty(pos0, "0");
        d.style.transform = `${translate}(${String(s.c - LIQUID.dropSize / 2)}px)`;
      });
    },
    [axis, blobRef, dropsRef, pos0, size1, translate],
  );

  /** Pours the gold from item `from` (or from where it is, mid-pour) to item `to`. */
  const pour = useCallback(
    (from: number, to: number): void => {
      const b = blobRef.current;
      const list = itemsRef.current();
      const target = list[to];
      const origin = list[from];
      if (!b || !target || !origin) return;
      const bSlot = slotOf(target, axis);
      let aSlot = slotOf(origin, axis);
      const running = animationsOf(b);
      let shape: string | undefined;
      if (running.length > 0) {
        // Retarget: carry on from the gold's current position and shape (stretch included), not from the old
        // choice. Its layout size (offsetWidth/Height) is unscaled, so the droplets' start centre is right too.
        shape = getComputedStyle(b).transform;
        const m = new DOMMatrixReadOnly(shape);
        const x = axis === "x" ? m.m41 : m.m42;
        const w = axis === "x" ? b.offsetWidth : b.offsetHeight;
        aSlot = { x, w, c: x + w / 2 };
      }
      for (const a of running) a.cancel();
      b.style.setProperty(size1, `${String(bSlot.w)}px`);
      b.style.transform = `${translate}(${String(bSlot.x)}px)`;
      if (reducedMotionNow()) {
        place(to);
        return;
      }
      anim(b, blobKeyframes(aSlot, bSlot, shape, axis), {
        duration: LIQUID.blobMs,
        easing: LIQUID.easing,
        fill: "none",
      });
      dropsRef.current.forEach((d, k) => {
        if (!d) return;
        const flying = animationsOf(d);
        // A droplet still in flight carries on from where it is.
        const dropFrom = flying.length > 0 ? getComputedStyle(d).transform : undefined;
        for (const a of flying) a.cancel();
        d.style.setProperty(pos0, "0");
        d.style.transform = `${translate}(${String(bSlot.c - LIQUID.dropSize / 2)}px)`;
        anim(d, dropKeyframes(aSlot, bSlot, k, dropFrom, axis), {
          duration: LIQUID.dropsMs,
          delay: LIQUID.dropDelayMs + k * LIQUID.dropStaggerMs,
          easing: LIQUID.easing,
          fill: "none",
        });
      });
    },
    [axis, blobRef, dropsRef, place, pos0, size1, translate],
  );

  // First paint (and every later change of the choice): place, or pour from the last placed item.
  useBrowserLayoutEffect(() => {
    const prev = placed.current;
    placed.current = index;
    if (index < 0) return;
    const n = itemsRef.current().length;
    if (prev === null || prev < 0 || prev === index || prev >= n) place(index);
    else pour(prev, index);
  }, [index, place, pour]);

  // A resized group (rotation, a sidebar opening, the toolbar) snaps the gold to the item's new box.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const key = (): string => `${String(el.offsetWidth)}x${String(el.offsetHeight)}`;
    size.current = key();
    const ro = new ResizeObserver(() => {
      if (key() === size.current) return;
      size.current = key();
      for (const a of animationsOf(blobRef.current)) a.cancel();
      for (const d of dropsRef.current) for (const a of animationsOf(d)) a.cancel();
      const at = placed.current ?? -1;
      if (at >= 0) place(at);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [blobRef, dropsRef, place, rootRef]);
}
