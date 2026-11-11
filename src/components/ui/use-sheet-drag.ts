"use client";

import { useEffect, type RefObject } from "react";
import { isReducedMotion } from "@/lib/preferences";
import { dragOffset, releaseVelocity, shouldCloseSheet, type DragSample } from "./sheet-gesture";

type Refs = {
  panel: RefObject<HTMLElement | null>;
  backdrop: RefObject<HTMLElement | null>;
  /** Handle + header: a drag here always moves the sheet (any pointer type). */
  grip: RefObject<HTMLElement | null>;
  /** Scrolling content: a touch drag down moves the sheet only while the content is at its top. */
  body: RefObject<HTMLElement | null>;
};

const INTERACTIVE = "button, a, input, select, textarea, label, [role='button'], [contenteditable]";
const SAMPLE_WINDOW_MS = 200;

/**
 * Drag-to-close for BottomSheet (P0-09 AC 11). The sheet follows the finger 1:1 downwards (friction upwards);
 * on release, `shouldCloseSheet` decides between closing and springing back. The transform is written straight
 * to the panel's style (not a CSS variable on a parent, so only the panel restyles). One pointer at a time: a
 * second finger is ignored, `pointercancel`/`touchcancel` springs back. Close button, Esc and backdrop tap stay
 * the non-drag ways to close (WCAG 2.5.7).
 */
export function useSheetDrag(active: boolean, refs: Refs, requestClose: () => void): void {
  useEffect(() => {
    const panel = refs.panel.current;
    const grip = refs.grip.current;
    const body = refs.body.current;
    const backdrop = refs.backdrop.current;
    if (!active || !panel || !grip || !body) return;

    let pointerId: number | null = null;
    let touchId: number | null = null;
    let startY = 0;
    let height = 0;
    let delta = 0;
    let samples: DragSample[] = [];
    let springTimer: ReturnType<typeof requestAnimationFrame> | undefined;

    const begin = (y: number, t: number) => {
      startY = y;
      delta = 0;
      height = panel.getBoundingClientRect().height;
      samples = [{ y, t }];
      panel.style.transition = "none";
      panel.style.willChange = "transform";
      if (backdrop) backdrop.style.transition = "none";
      panel.dataset.dragging = "";
    };

    const move = (y: number, t: number) => {
      delta = y - startY;
      const offset = dragOffset(delta);
      panel.style.transform = `translate3d(0, ${String(offset)}px, 0)`;
      if (backdrop && height > 0) {
        backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, offset) / height));
      }
      samples.push({ y, t });
      const cutoff = t - SAMPLE_WINDOW_MS;
      while (samples.length > 2 && (samples[0]?.t ?? t) < cutoff) samples.shift();
    };

    const clearInline = (keepTransform: boolean) => {
      panel.style.transition = "";
      panel.style.willChange = "";
      if (!keepTransform) panel.style.transform = "";
      if (backdrop) {
        backdrop.style.transition = "";
        backdrop.style.opacity = "";
      }
      delete panel.dataset.dragging;
    };

    const springBack = () => {
      clearInline(false);
    };

    const end = (cancelled: boolean) => {
      const close =
        !cancelled &&
        shouldCloseSheet({ distance: delta, velocity: releaseVelocity(samples), height });
      if (!close) {
        springBack();
        return;
      }
      // The overlay clears the inline transform when it starts closing, so the exit continues from here.
      // Reduced motion keeps the sheet where the finger left it and only fades it.
      panel.style.transition = "";
      panel.style.willChange = "";
      if (backdrop) backdrop.style.transition = "";
      delete panel.dataset.dragging;
      if (isReducedMotion()) panel.dataset.keepTransform = "";
      requestClose();
      // A parent that keeps the sheet open (controlled `open` unchanged) gets it back in place.
      springTimer = requestAnimationFrame(() => {
        springTimer = requestAnimationFrame(() => {
          if (panel.isConnected && panel.closest("dialog")?.dataset.state === "open") {
            delete panel.dataset.keepTransform;
            springBack();
          }
        });
      });
    };

    /* Grip: pointer events, any pointer type. */
    const onPointerDown = (e: PointerEvent) => {
      if (pointerId !== null || touchId !== null || !e.isPrimary || e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      pointerId = e.pointerId;
      grip.setPointerCapture(e.pointerId);
      begin(e.clientY, e.timeStamp);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      move(e.clientY, e.timeStamp);
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
      end(e.type === "pointercancel");
    };

    /* Content: touch only, and only while the content is scrolled to its top and the finger moves down. */
    let touchStartY = 0;
    let touchTracking = false;
    const onTouchStart = (e: TouchEvent) => {
      if (pointerId !== null || touchId !== null || e.touches.length !== 1) return;
      const touch = e.changedTouches[0];
      if (!touch || body.scrollTop > 0) return;
      touchTracking = true;
      touchStartY = touch.clientY;
      touchId = touch.identifier;
    };
    const findTouch = (list: TouchList): Touch | undefined =>
      [...list].find((t) => t.identifier === touchId);
    const onTouchMove = (e: TouchEvent) => {
      if (touchId === null) return;
      const touch = findTouch(e.changedTouches);
      if (!touch) return;
      if (touchTracking) {
        const dy = touch.clientY - touchStartY;
        if (dy < 0 || body.scrollTop > 0) {
          // Moving up (or content scrolled): this is a content scroll, not a sheet drag.
          touchTracking = false;
          touchId = null;
          return;
        }
        if (dy === 0) return;
        touchTracking = false;
        begin(touchStartY, e.timeStamp);
      }
      if (e.cancelable) e.preventDefault();
      move(touch.clientY, e.timeStamp);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchId === null || !findTouch(e.changedTouches)) return;
      const wasDragging = !touchTracking;
      touchId = null;
      touchTracking = false;
      if (wasDragging) end(e.type === "touchcancel");
    };

    grip.addEventListener("pointerdown", onPointerDown);
    grip.addEventListener("pointermove", onPointerMove);
    grip.addEventListener("pointerup", onPointerEnd);
    grip.addEventListener("pointercancel", onPointerEnd);
    body.addEventListener("touchstart", onTouchStart, { passive: true });
    body.addEventListener("touchmove", onTouchMove, { passive: false });
    body.addEventListener("touchend", onTouchEnd);
    body.addEventListener("touchcancel", onTouchEnd);
    return () => {
      if (springTimer !== undefined) cancelAnimationFrame(springTimer);
      grip.removeEventListener("pointerdown", onPointerDown);
      grip.removeEventListener("pointermove", onPointerMove);
      grip.removeEventListener("pointerup", onPointerEnd);
      grip.removeEventListener("pointercancel", onPointerEnd);
      body.removeEventListener("touchstart", onTouchStart);
      body.removeEventListener("touchmove", onTouchMove);
      body.removeEventListener("touchend", onTouchEnd);
      body.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [active, refs.panel, refs.grip, refs.body, refs.backdrop, requestClose]);
}
