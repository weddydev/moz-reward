/**
 * Motion presets and helpers (P0-10 step B, DESIGN §7). The presets are CSS that already exists in
 * globals.css (the P0-09 overlays and toasts, the press utilities) plus the popover and stagger added here;
 * this table names them so components and the `/dev/motion` gallery point at one definition, and the motion
 * CSS scan (presets.test.ts, AC 6) knows which rules to read. Pure: no React, no browser APIs.
 *
 * Everyday motion: transform + opacity only, ≤ 300ms, `--ease-out` for entrances, exits faster (`--dur-exit`).
 * Reduced motion (system or `data-reduce-motion="true"`): offsets are multiplied by `--motion-on` (0), the
 * global safety net in globals.css stops transform transitions, and durations cap at `--dur-reduced` (150ms).
 */

import type { CSSProperties } from "react";

export type MotionPreset = {
  /** The CSS selector (or attribute) that carries the motion; what a component puts on its element. */
  selector: string;
  /** What moves, for the gallery and code readers. */
  motion: string;
  /** Enter / exit duration tokens. */
  enter: string;
  exit: string;
  /** Read by the AC 6 scan (transform + opacity only). Press and hover utilities also tint shadow/colour. */
  scan: boolean;
};

export const MOTION_PRESETS = {
  /** Centred dialog (`<Modal>`): scales from .96 with a fade, never from 0; not anchored to its trigger. */
  modal: {
    selector: '.overlay[data-kind="modal"]',
    motion: "scale .96 → 1 + fade",
    enter: "--dur-base",
    exit: "--dur-exit",
    scan: true,
  },
  /** `<SidePanel>`: slides its own width in from the right, opaque while it moves. */
  panel: {
    selector: '.overlay[data-kind="panel"]',
    motion: "translateX(100%) → 0",
    enter: "--dur-base",
    exit: "--dur-exit",
    scan: true,
  },
  /** `<BottomSheet>`: rises its own height; drag to close (velocity or distance). */
  sheet: {
    selector: '.overlay[data-kind="sheet"]',
    motion: "translateY(100%) → 0",
    enter: "--dur-base",
    exit: "--dur-exit",
    scan: true,
  },
  /** The dim layer behind every overlay. */
  backdrop: {
    selector: ".overlay-backdrop",
    motion: "fade",
    enter: "--dur-base",
    exit: "--dur-exit",
    scan: true,
  },
  /** `useToast()`: slides up 12px + fade; transitions, so a burst of toasts retargets smoothly. */
  toast: {
    selector: ".toast",
    motion: "translateY(12px) → 0 + fade",
    enter: "--dur-base",
    exit: "--dur-exit",
    scan: true,
  },
  /** `<Popover>`: scales from .95 + fade from the trigger (`transformOriginFor`); interruptible. */
  popover: {
    selector: ".popover",
    motion: "scale .95 → 1 + fade, from the trigger",
    enter: "--dur-base",
    exit: "--dur-exit",
    scan: true,
  },
  /** List items entering together: `className="stagger-item"` + `style={staggerStyle(i)}`. */
  stagger: {
    selector: ".stagger-item",
    motion: "translateY(8px) → 0 + fade, 30–80ms apart",
    enter: "--dur-base",
    exit: "none",
    scan: true,
  },
  /**
   * Press on a whole control: `.pressable` scales to .97 (dims under reduced motion) and springs back. Also
   * eases its shadow and background (DESIGN §7 "slight shadow reduction"), so it is outside the AC 6 scan.
   */
  press: {
    selector: ".pressable",
    motion: "scale .97 on :active",
    enter: "--dur-fast",
    exit: "--dur-fast",
    scan: false,
  },
  /** Press on the visible part of a control whose hit area is bigger (Switch track): `data-press`. */
  pressTarget: {
    selector: "[data-press]",
    motion: "scale .97 when its parent is :active",
    enter: "--dur-fast",
    exit: "--dur-fast",
    scan: true,
  },
} as const satisfies Record<string, MotionPreset>;

export type MotionPresetName = keyof typeof MOTION_PRESETS;

/** Stagger rules (DESIGN §7): 30–80ms apart, and the 8th item's delay is the longest any item waits. */
export const STAGGER = {
  minStepMs: 30,
  maxStepMs: 80,
  defaultStepMs: 50,
  lastStaggeredIndex: 7,
} as const;

/**
 * Delay before item `index` (0-based) starts its enter, in ms. Steps of `stepMs`, clamped to 30–80ms; items
 * after the 8th share its delay, so a 50-item list never waits more than 560ms. Staggering is decoration:
 * the items are in the DOM, readable and clickable from the first paint (CSS animates opacity, nothing else
 * is hidden).
 */
export function staggerDelay(index: number, stepMs: number = STAGGER.defaultStepMs): number {
  const step = Number.isFinite(stepMs)
    ? Math.min(STAGGER.maxStepMs, Math.max(STAGGER.minStepMs, stepMs))
    : STAGGER.defaultStepMs;
  const position = Number.isInteger(index) && index > 0 ? index : 0;
  return Math.min(position, STAGGER.lastStaggeredIndex) * step;
}

/** Inline style for a `.stagger-item`: the delay as a CSS variable (zeroed by CSS under reduced motion). */
export function staggerStyle(index: number, stepMs?: number): CSSProperties {
  return { "--stagger-delay": `${String(staggerDelay(index, stepMs))}ms` } as CSSProperties;
}

export type Box = { left: number; top: number; width: number; height: number };
export type Point = { x: number; y: number };

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const finite = (b: Box): boolean =>
  [b.left, b.top, b.width, b.height].every((n) => Number.isFinite(n));

/**
 * `transform-origin` for a popover, in px from its top-left: the trigger's centre, clamped inside the
 * popover box. A popover below its trigger grows from its top edge under the trigger, one above from its
 * bottom edge; a trigger wider than the popover gives its centre, clamped. Missing or non-finite numbers:
 * the popover's centre (the modal default; never throws).
 */
export function transformOriginFor(trigger: Box, popover: Box): Point {
  const width = Math.max(0, Number.isFinite(popover.width) ? popover.width : 0);
  const height = Math.max(0, Number.isFinite(popover.height) ? popover.height : 0);
  if (!finite(trigger) || !finite(popover)) return { x: width / 2, y: height / 2 };
  return {
    x: Math.round(clamp(trigger.left + trigger.width / 2 - popover.left, 0, width)),
    y: Math.round(clamp(trigger.top + trigger.height / 2 - popover.top, 0, height)),
  };
}

export function originCss(origin: Point): string {
  return `${String(origin.x)}px ${String(origin.y)}px`;
}

/** Gap between trigger and popover, and the margin a popover keeps from the viewport edge (DESIGN §5 gutter). */
export const POPOVER_GAP_PX = 8;
export const VIEWPORT_GUTTER_PX = 16;

/**
 * Where a popover goes (fixed position): below its trigger, start-aligned; above when it doesn't fit below
 * and does above; always at least 16px inside the viewport horizontally (a trigger at the right edge pushes
 * it left; one wider than the viewport pins it to the left gutter).
 */
export function placePopover(
  trigger: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; side: "below" | "above" } {
  const below = trigger.top + trigger.height + POPOVER_GAP_PX;
  const above = trigger.top - POPOVER_GAP_PX - size.height;
  const fitsBelow = below + size.height <= viewport.height - VIEWPORT_GUTTER_PX;
  const fitsAbove = above >= VIEWPORT_GUTTER_PX;
  const side = !fitsBelow && fitsAbove ? "above" : "below";
  const maxLeft = viewport.width - VIEWPORT_GUTTER_PX - size.width;
  const left = Math.max(VIEWPORT_GUTTER_PX, Math.min(trigger.left, maxLeft));
  return { left: Math.round(left), top: Math.round(side === "above" ? above : below), side };
}
