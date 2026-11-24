"use client";

import { useEffect, useRef, useState } from "react";
import { useChangeMotion } from "@/components/motion/useChangeMotion";
import { useLiquidPour } from "@/components/motion/useLiquidPour";
import { cx } from "@/lib/cx";
import { reducedMotionNow } from "@/lib/motion/anim";
import { LIQUID, nextEnabled } from "@/lib/motion/controls";
import { burst } from "@/lib/motion/fx";
import { useHydrated } from "@/lib/use-hydrated";

export type LiquidOption<T extends string> = {
  value: T;
  label: string;
  /** A second, smaller line (the reference's "600 gold"). */
  detail?: string;
  disabled?: boolean;
};

/**
 * Liquid choice (PD-05; DESIGN §6.3, §7.4; reference `.liquid` + `liquid()`): a radio group whose selection is a
 * drop of liquid gold. Choosing pours it across: the blob stretches (1.3 × .76 at 42%), overshoots by 4 px (76%)
 * and settles (660 ms, liquid easing) while two droplets arc over (760 ms, 90 / 170 ms delays), merged by the
 * goo filter (`GooFilter`, root layout); 10 sparks rise over the choice at 520 ms. A second choice mid-pour
 * starts from where the gold is, never queues. Arrow keys move and select (wrapping, skipping disabled options)
 * with a roving tabindex. Lite tier: no filter, no droplets. Reduced motion: the gold moves at once.
 * Controlled (`value`) or not (`defaultValue`); with `name`, a hidden input carries the value in a form.
 * Controlled groups are disabled until hydrated so an early press is never lost (C-20).
 */
export function LiquidChoice<T extends string>({
  label,
  options,
  value,
  defaultValue,
  onChange,
  name,
  sparks = true,
  disabled: groupDisabled = false,
  labelledBy,
  describedBy,
  invalid,
  className,
  parity,
}: {
  /** The group's accessible name (`aria-label`), unless `labelledBy` names a visible label instead. */
  label: string;
  labelledBy?: string;
  describedBy?: string | undefined;
  invalid?: boolean;
  /** Every option off (the group keeps its gold where it is). */
  disabled?: boolean;
  options: ReadonlyArray<LiquidOption<T>>;
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  name?: string;
  /** Sparks over the new choice (the reference's reward picker); off for quiet filters. */
  sparks?: boolean;
  className?: string;
  parity?: string;
}): React.JSX.Element {
  const hydrated = useHydrated();
  const controlled = value !== undefined;
  const [own, setOwn] = useState<T | undefined>(defaultValue);
  const current = controlled ? value : own;
  /** The chosen option, or -1 when nothing is chosen yet (no gold shows; the first option takes the tab stop). */
  const index = options.findIndex((o) => o.value === current);
  const n = options.length;
  // The chosen option holds the tab stop unless it is disabled (then nothing could reach the group): the first
  // enabled option takes it, as when nothing is chosen.
  const tabStop =
    index >= 0 && options[index]?.disabled !== true
      ? index
      : Math.max(
          0,
          options.findIndex((o) => o.disabled !== true),
        );

  const root = useRef<HTMLDivElement>(null);
  const blob = useRef<HTMLSpanElement>(null);
  const drops = useRef<Array<HTMLSpanElement | null>>([]);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const sparkTimer = useRef<number | null>(null);

  useLiquidPour({
    rootRef: root,
    blobRef: blob,
    dropsRef: drops,
    items: () => items.current,
    index,
  });

  useEffect(
    () => () => {
      if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
    },
    [],
  );

  /** Whether the pending choice came from the keyboard (focus follows it once it is taken). */
  const byKeyboard = useRef(false);
  // The sparks and the keyboard's focus follow the value, not the press (FOLLOWUPS 75): a parent that refuses
  // the choice gets neither, and the focus stays on the chosen option.
  const requestChoice = useChangeMotion(current, (v) => {
    const j = options.findIndex((o) => o.value === v);
    const el = items.current[j];
    if (!el) return;
    if (byKeyboard.current) el.focus();
    if (!sparks || reducedMotionNow()) return;
    const r = el.getBoundingClientRect();
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
    if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
    sparkTimer.current = window.setTimeout(() => {
      sparkTimer.current = null;
      burst(x, y, { type: "spark", count: LIQUID.sparks, speed: LIQUID.sparkSpeed });
    }, LIQUID.sparkAtMs);
  });

  const choose = (j: number, focus: boolean): void => {
    const o = options[j];
    if (!o || o.disabled || groupDisabled) return;
    if (j === index) {
      if (focus) items.current[j]?.focus();
      return;
    }
    byKeyboard.current = focus;
    requestChoice(o.value);
    if (!controlled) setOwn(o.value);
    onChange?.(o.value);
  };

  const disabled = options.map((o) => groupDisabled || o.disabled === true);
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    // With nothing chosen, Right/Down starts at the first option and Left/Up at the last.
    const from = index >= 0 ? index : dir === 1 ? n - 1 : 0;
    choose(nextEnabled(disabled, from, dir), true);
  };

  // Before the first layout effect (server render, no JS yet) the gold sits on the choice by CSS alone.
  const at = Math.max(0, index);
  const cssPlace = `calc(5px + ${String(at)} * 100%)`;
  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid ? true : undefined}
      aria-disabled={groupDisabled ? true : undefined}
      onKeyDown={onKeyDown}
      data-parity={parity}
      data-empty={index < 0 ? "" : undefined}
      className={cx("m-liquid", className)}
      style={{ "--n": n } as React.CSSProperties}
    >
      <div className="m-goo" aria-hidden="true">
        <span
          ref={blob}
          className="m-blob"
          data-part="thumb"
          style={{
            width: `calc((100% - 10px) / ${String(n)})`,
            transform: `translateX(${cssPlace})`,
          }}
        />
        {[0, 1].map((k) => (
          <span
            key={k}
            ref={(el) => {
              drops.current[k] = el;
            }}
            className="m-drop"
            style={{
              left: `calc(5px + (${String(at)} + .5) * (100% - 10px) / ${String(n)} - ${String(LIQUID.dropSize / 2)}px)`,
            }}
          />
        ))}
      </div>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            items.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === tabStop ? 0 : -1}
          disabled={groupDisabled || o.disabled === true || (controlled && !hydrated)}
          // Dimmed only when really disabled, never for the hydration lock (C-20; design review 22 Nov).
          data-disabled={groupDisabled || o.disabled === true ? "" : undefined}
          onClick={() => {
            choose(i, false);
          }}
          className="m-opt"
        >
          <b>{o.label}</b>
          {/* A space for the accessible name ("Coffee 600 gold"); whitespace between flex items never renders. */}
          {o.detail ? (
            <>
              {" "}
              <small>{o.detail}</small>
            </>
          ) : null}
        </button>
      ))}
      {name ? <input type="hidden" name={name} value={current ?? ""} /> : null}
    </div>
  );
}
