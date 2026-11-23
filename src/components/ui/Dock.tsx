"use client";

import { useEffect, useRef, useState } from "react";
import { useLiquidPour } from "@/components/motion/useLiquidPour";
import { cx } from "@/lib/cx";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { DOCK, LIQUID } from "@/lib/motion/controls";
import { burst } from "@/lib/motion/fx";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";

/** Class of a dock item (an icon over its label); give it `data-liq` so the gold can sit on it. */
export const DOCK_ITEM = "m-dk";
/** Class of the raised Scan coin (no visible label: put the name in a `sr-only` span). */
export const DOCK_SCAN = "m-scan";

/**
 * The Scan coin's press (reference `#scanBtn` click): it squeezes to .86, swells to 1.08 and settles (500 ms)
 * while 26 sparks burst from its centre. Reduced motion: no sparks (the FX engine is off) and a 150 ms press.
 */
export function scanPress(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  if (!reducedMotionNow()) {
    burst(r.left + r.width / 2, r.top + r.height / 2, {
      type: "spark",
      count: DOCK.scanSparks,
      speed: DOCK.scanSparkSpeed,
    });
  }
  anim(el, DOCK.scanPressKeyframes, { duration: DOCK.scanPressMs, fill: "none" });
}

/**
 * Floating dock (PD-07; DESIGN §5, §7.4; reference `.dock`, `.dk`, `.scan`, `liquid(dock)`): a glass bar 12 px
 * from the edges with its items in equal columns; the current item sits on liquid gold that pours to the next
 * one like the liquid choice (`useLiquidPour`), its icon lifted. A raised Scan coin carries an orbiting light
 * (2.6 s) and a radar ring (2.4 s). Loops sleep while the dock is off screen or the tab is hidden; the lite tier
 * drops the blur, the goo and the droplet. With `placement` "fixed" (the app) it sits over the page, clear of
 * the home indicator and the notch, and slides away while the on-screen keyboard is open; "frame" places it
 * inside a positioned frame (the phone on `/dev/molten`).
 *
 * Children are the items in order: links or buttons with `DOCK_ITEM` (and `data-liq`) or `DOCK_SCAN`. `active`
 * counts only the `data-liq` items (-1: none is current, e.g. on the Scan page, and the gold hides); `column`
 * and `columns` place the gold before hydration, when only CSS can (read on the first render only).
 */
export function Dock({
  label,
  active,
  column,
  columns,
  placement = "fixed",
  hideFrom,
  parity,
  className,
  children,
  ...rest
}: {
  label: string;
  active: number;
  column: number;
  columns: number;
  placement?: "fixed" | "frame";
  /** The width from which the dock gives way to the side navigation. */
  hideFrom?: "md" | "lg";
  parity?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">): React.JSX.Element {
  const root = useRef<HTMLElement>(null);
  const blob = useRef<HTMLSpanElement>(null);
  const drops = useRef<Array<HTMLSpanElement | null>>([]);
  const keyboard = useKeyboardOpen();

  useLiquidPour({
    rootRef: root,
    blobRef: blob,
    dropsRef: drops,
    items: () => [...(root.current?.querySelectorAll<HTMLElement>(":scope > [data-liq]") ?? [])],
    index: active,
  });

  // The halo and radar loop forever: they sleep off screen (or under `display: none` at desktop widths) and
  // while the tab is hidden, like the reference's phone.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let seen = true;
    const sync = (): void => {
      el.classList.toggle("m-paused", !seen || document.hidden);
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            for (const e of entries) seen = e.isIntersecting;
            sync();
          });
    io?.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // The CSS-only placement is for the first paint (before hydration): frozen after it, so a later render never
  // writes it over the hook's pixel placement (the gold jumped to the first item while draining on Scan).
  const [ssr] = useState(() => ({ at: Math.max(0, column), columns }));
  return (
    <nav
      ref={root}
      aria-label={label}
      data-parity={parity}
      data-placement={placement}
      data-hide-from={hideFrom}
      data-keyboard={placement === "fixed" && keyboard ? "" : undefined}
      data-empty={active < 0 ? "" : undefined}
      className={cx("m-dock", className)}
      {...rest}
    >
      <div className="m-goo" aria-hidden="true">
        <span
          ref={blob}
          className="m-blob"
          style={{
            width: `calc((100% - 12px) / ${String(ssr.columns)})`,
            transform: `translateX(calc(6px + ${String(ssr.at)} * 100%))`,
          }}
        />
        <span
          ref={(el) => {
            drops.current[0] = el;
          }}
          className="m-drop"
          style={{
            left: `calc(6px + (${String(ssr.at)} + .5) * (100% - 12px) / ${String(ssr.columns)} - ${String(LIQUID.dropSize / 2)}px)`,
          }}
        />
      </div>
      {children}
    </nav>
  );
}
