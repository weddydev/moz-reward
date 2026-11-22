"use client";

import { type ChangeEvent, type CSSProperties, useEffect, useLayoutEffect, useRef } from "react";
import { cx } from "@/lib/cx";
import { reducedMotionNow } from "@/lib/motion/anim";
import {
  crossedNotches,
  SLIDER,
  sliderFraction,
  sliderTilt,
  sliderValue,
} from "@/lib/motion/controls";
import { burst } from "@/lib/motion/fx";
import { useHydrated } from "@/lib/use-hydrated";

// Layout effects only run in the browser.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A labelled point along the range (a reward you can afford from there). */
export type SliderNotch = { value: number; label: string };

const gbNumber = (n: number): string => Math.round(n).toLocaleString("en-GB");

/**
 * Molten slider (PD-06; DESIGN §6.3, §7.4; reference `.slider` + "slider"). A native range input (keyboard,
 * screen readers, forms) lies invisible over the whole 64 px slider; above it a coin thumb runs along an ivory
 * track as the gold fill (with its 2.4 s glint) grows behind it. The value rides in an obsidian bubble on the
 * coin that leans against the movement, harder the faster (±28° at most), and springs upright (.5 s) once input
 * stops for 90 ms. Crossing a notch going up sparks it once (12 sparks at the notch) and calls `onNotch`; a jump
 * across several (End, PageUp, a click far along) sparks each once. Notches at or below the value light up in
 * the row of labels under the track. Reduced motion: no lean and no sparks. Controlled; disabled until hydrated
 * so an early drag is never lost (C-20). `parity` marks the slider for the parity harness.
 */
export function Slider({
  label,
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  notches = [],
  onNotch,
  valueText,
  format = gbNumber,
  disabled = false,
  name,
  id,
  parity,
  className,
}: {
  /** The input's accessible name. */
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  notches?: readonly SliderNotch[];
  /** A notch the thumb just crossed going up (once per crossing). */
  onNotch?: (notch: number) => void;
  /** What a screen reader says for a value (`aria-valuetext`), e.g. "240 of 720 gold". */
  valueText?: (value: number) => string;
  /** The bubble's text (default: the value, rounded, with UK digit grouping). */
  format?: (value: number) => string;
  disabled?: boolean;
  name?: string;
  id?: string;
  parity?: string;
  className?: string;
}): React.JSX.Element {
  const hydrated = useHydrated();
  const shown = sliderValue(value, min, max, step);
  const fraction = sliderFraction(shown, min, max);
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  // The value on screen (a parent may refuse a move: the next one then starts from its value) and the last
  // input's time, for the lean.
  const rendered = useRef(shown);
  const lastAt = useRef(Number.NEGATIVE_INFINITY);
  const settle = useRef<number | undefined>(undefined);

  useBrowserLayoutEffect(() => {
    rendered.current = shown;
  });
  useBrowserLayoutEffect(() => {
    lastAt.current = performance.now();
    return () => {
      window.clearTimeout(settle.current);
    };
  }, []);

  const spark = (notch: number): void => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const half = SLIDER.thumbPx / 2;
    burst(
      r.left + half + sliderFraction(notch, min, max) * (r.width - SLIDER.thumbPx),
      r.top + THUMB_TOP + half,
      { type: "spark", count: SLIDER.sparks, speed: SLIDER.sparkSpeed },
    );
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>): void => {
    const next = Number(e.currentTarget.value);
    const prev = rendered.current;
    const now = performance.now();
    const dt = now - lastAt.current;
    lastAt.current = now;
    for (const m of crossedNotches(
      prev,
      next,
      notches.map((n) => n.value),
    )) {
      spark(m);
      onNotch?.(m);
    }
    const b = bubble.current;
    if (b && !reducedMotionNow() && max > min) {
      b.style.setProperty("--tilt", `${sliderTilt((next - prev) / (max - min), dt).toFixed(1)}deg`);
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => {
        b.style.setProperty("--tilt", "0deg");
      }, SLIDER.settleMs);
    }
    // A second input in the same task starts from here; once this event is done (React has rendered the value
    // or put a refused one back), the input itself says what is on screen.
    rendered.current = next;
    const input = e.currentTarget;
    queueMicrotask(() => {
      rendered.current = Number(input.value);
    });
    onChange(next);
  };

  return (
    <div className={cx("m-slider-wrap", className)}>
      <div
        ref={root}
        className="m-slider"
        data-parity={parity}
        style={{ "--p": fraction } as CSSProperties}
      >
        <input
          type="range"
          id={id}
          name={name}
          min={min}
          max={max}
          step={step}
          value={shown}
          aria-label={label}
          aria-valuetext={valueText?.(shown)}
          disabled={disabled || !hydrated}
          onChange={onInput}
        />
        <div className="m-sl-track">
          <div className="m-sl-fill" />
        </div>
        <div className="m-sl-thumb" aria-hidden="true">
          <span ref={bubble} className="m-bubble">
            {format(shown)}
          </span>
        </div>
      </div>
      {notches.length > 0 ? (
        <div className="m-ticks">
          {notches.map((n) => (
            <span key={n.value} className={cx(n.value > min && shown >= n.value && "hit")}>
              {n.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The coin's top inside the slider (reference `.sl-thumb{top:14px}`). */
const THUMB_TOP = 14;
