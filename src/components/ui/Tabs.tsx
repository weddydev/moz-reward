"use client";

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from "react";
import { cx } from "@/lib/cx";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { springEasing, TABS } from "@/lib/motion/controls";
import { useHydrated } from "@/lib/use-hydrated";

export type TabItem<T extends string> = { value: T; label: string; count?: number };

// Layout effects only run in the browser; the server render places the pill with CSS alone.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The element's running animations ([] where Web Animations are missing, e.g. jsdom). */
const animationsOf = (el: Element | null | undefined): Animation[] =>
  el && typeof el.getAnimations === "function" ? el.getAnimations() : [];

/**
 * Tabs (PD-06; DESIGN §6.3, §7.4; reference `.seg` + "tabs"): WAI-ARIA tabs on an obsidian track. A metal pill
 * springs to the chosen tab (.6 s) with a light trail behind it (.95 s); the panel slides in 32 px from the side
 * you moved toward (380 ms). Numbers in a panel count up with `CountUp`. Arrows move focus and selection
 * (wrapping), Home and End jump; activation is automatic. The pill sits by CSS alone (`--n` tabs, `--i` chosen),
 * so the server render is right and rapid switching retargets the transitions instead of queueing; a new switch
 * mid-slide restarts the slide. Columns are equal: the track fills its row, and when the labels don't fit it
 * grows to the widest label × n and scrolls inside its own row, keeping the chosen tab in view. Reduced motion:
 * the pill and panel move at once. Disabled until hydrated so an early press is never lost (C-20).
 * `parity` marks the track for the parity harness.
 */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  children,
  className,
  parity,
}: {
  label: string;
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
  className?: string;
  parity?: string;
}): React.JSX.Element {
  const base = useId();
  const hydrated = useHydrated();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    items.findIndex((t) => t.value === value),
  );
  const shown = useRef(index);

  // The motion follows the value, not the click: a parent that refuses a change gets none.
  useBrowserLayoutEffect(() => {
    const from = shown.current;
    shown.current = index;
    if (from === index) return;
    const dir = index > from ? 1 : -1;
    // The pill and its trail glide from wherever they are now (mid-glide included) to the chosen tab; CSS
    // already holds them at the new place, so a cancelled or skipped glide still ends right.
    const seg = scroller.current?.querySelector(".m-seg");
    if (!reducedMotionNow())
      for (const [sel, ms] of [
        [".m-seg-ind", TABS.pillMs],
        [".m-seg-trail", TABS.trailMs],
      ] as const) {
        const el = seg?.querySelector<HTMLElement>(sel);
        if (!el || typeof el.animate !== "function") continue;
        const moving = animationsOf(el);
        const at =
          moving.length > 0 ? getComputedStyle(el).transform : `translateX(${String(from * 100)}%)`;
        for (const a of moving) a.cancel();
        const glide = el.animate(
          [{ transform: at }, { transform: `translateX(${String(index * 100)}%)` }],
          { duration: ms, easing: springEasing() },
        );
        // A safety net, as for the wipe: WebKit can leave an animation's clock unstarted (a retargeted transition
        // stuck at its start, CI 45467487343, reproduced on Linux WebKit); a timer still runs, so the pill lands
        // on the chosen tab once its time is up.
        window.setTimeout(() => {
          if (glide.playState === "running") glide.finish();
        }, ms + 120);
      }
    for (const a of animationsOf(panel.current)) a.cancel();
    // Reduced motion: a fade only, no slide (DESIGN §7.2).
    anim(
      panel.current,
      reducedMotionNow()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateX(${String(dir * TABS.panelShiftPx)}px)` },
            { opacity: 1, transform: "none" },
          ],
      { duration: TABS.panelMs, fill: "none" },
    );
    // Many tabs: bring the chosen one into the row's view (horizontally only; the page never scrolls).
    const sc = scroller.current;
    const tab = refs.current[index];
    if (!sc || !tab || sc.scrollWidth <= sc.clientWidth) return;
    // In the scroller's own coordinates: `offsetLeft` counts from the track (`.m-seg`, positioned), not from the
    // scroller, so it missed the scroller's 6 px padding and the track's border, and the last tab stayed cut off
    // where the browser's focus scroll didn't already reveal it (WebKit, CI 45061015313).
    const box = sc.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    const left = r.left - box.left + sc.scrollLeft;
    const right = r.right - box.left + sc.scrollLeft;
    if (left < sc.scrollLeft) sc.scrollLeft = left;
    else if (right > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = right - sc.clientWidth;
  }, [index]);

  function onKeyDown(e: React.KeyboardEvent) {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % items.length
        : e.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.value);
    refs.current[next]?.focus();
  }

  return (
    <div className={cx("m-tabs", className)}>
      <div ref={scroller} className="m-seg-scroll">
        <div
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          data-parity={parity}
          className="m-seg"
          style={{ "--n": items.length, "--i": index } as React.CSSProperties}
        >
          <span aria-hidden="true" className="m-seg-trail" />
          <span aria-hidden="true" className="m-seg-ind" />
          {items.map((t, i) => {
            const selected = t.value === value;
            return (
              <button
                key={t.value}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                id={`${base}-tab-${t.value}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${base}-panel`}
                // The chosen tab holds the tab stop; with none chosen, the first does (FOLLOWUPS 82).
                tabIndex={i === index ? 0 : -1}
                // Disabled until hydrated so an early press is never lost (C-20).
                disabled={!hydrated}
                onClick={() => {
                  if (!selected) onChange(t.value);
                }}
              >
                {t.label}
                {t.count !== undefined ? (
                  <>
                    {" "}
                    <span className="m-seg-count">{t.count}</span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="m-panels">
        <div
          ref={panel}
          id={`${base}-panel`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${value}`}
          tabIndex={0}
          className="m-tabpanel"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
