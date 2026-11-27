"use client";

import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMagnetic, usePress } from "@/components/motion/press";
import { usePauseOffscreen } from "@/components/motion/usePauseOffscreen";
import { cx } from "@/lib/cx";
import { BUTTON } from "@/lib/motion/controls";
import { celebrate as burstAt, ripple } from "@/lib/motion/press";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-classes";
import { Spinner } from "./Spinner";

/**
 * Molten buttons (PD-04; DESIGN §6.3, §7.4; reference `.btn`, `.btn-molten`, `.btn-orbit`, `.btn-ghost`):
 * - `molten` (primary): flowing gold fill, magnetic lean and pointer light on fine pointers, a ripple from the
 *   press point (the centre for a key press), press scale .93 on the spring.
 * - `orbit` (secondary): light orbiting the border. `ghost`: gold underline that grows on hover, optional arrow.
 * - `destructive`: the molten language in danger red (no celebration).
 * Sizes 54 (default) and 46. `loading` keeps the width (the label stays in layout, hidden) and blocks clicks.
 * `resultLabel` rolls the label to the result after a successful click (an `onClick` that doesn't throw or
 * resolve to `false`) and back after 1.7 s. Every successful click throws 28 sparks and 6 coins from the press
 * point (human, 27 Nov 2026: "it should appear in every button"); `celebrate={false}` opts a button out and a
 * destructive one never celebrates. A second click while the result shows restarts the roll without a second celebration.
 * Hover effects are fine-pointer only; under reduced motion there is no lean, no particles, and the roll
 * swaps within 150 ms.
 */
export { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-classes";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner and blocks clicks; keeps the button's width (label stays in layout). */
  loading?: boolean;
  icon?: ReactNode;
  /** The label the button rolls to after a successful click (DESIGN §7.4 label roll). */
  resultLabel?: string;
  /** How long the result label shows before rolling back (default 1.7 s; the reference's sign-in button: 2.2 s). */
  resultMs?: number;
  /**
   * Called when the result label's time is up, just before it rolls back: a caller that replaces the button
   * then (Request points → its pending card) swaps on the same clock, so the label never starts back first.
   */
  onRollEnd?: () => void;
  /**
   * Sparks (and `coins`, default 6) from the press point after a successful click. On by default for every
   * variant but `destructive`; `false` turns it off.
   */
  celebrate?: boolean | { coins: number };
  /** May be async: resolving to `false` (or throwing) means "not a success": no roll, no celebration. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => unknown;
};

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" && v !== null && typeof (v as { then?: unknown }).then === "function";

/**
 * Calls `done(ok)` with whether a click handler's result counts as a success: at once for a plain value (so the
 * roll starts in the same task as the click), after it settles for a promise (rejected = not a success).
 */
export function onSettled(result: unknown, done: (ok: boolean) => void): void {
  if (isThenable(result))
    result.then(
      (v) => {
        done(v !== false);
      },
      () => {
        done(false);
      },
    );
  else done(result !== false);
}

/** A ref that never holds an element: a ghost button has no loop to pause. */
const NO_ELEMENT = { current: null };

export function Button({
  variant = "molten",
  size = 54,
  block,
  loading = false,
  icon,
  resultLabel,
  resultMs = BUTTON.labelBackMs,
  onRollEnd,
  celebrate,
  className,
  children,
  disabled,
  type = "button",
  onClick,
  ...rest
}: Props): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  // The visible roll is a class set in the click's own task (as the reference does); `rolled` moves the
  // accessible name to the result label while it shows and keeps `ok` in the rendered class list, so a
  // `className` change mid-roll can't drop it (FOLLOWUPS 81).
  const [rolled, setRolled] = useState(false);
  const celebrating = useRef(false);
  const backTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flowing = variant === "molten" || variant === "destructive";
  const celebrates = variant !== "destructive" && celebrate !== false;
  // Molten, destructive and orbit buttons loop while idle: the loops sleep off screen (FOLLOWUPS 73).
  usePauseOffscreen(variant === "ghost" ? NO_ELEMENT : ref);
  usePress(ref, { ripple: flowing });
  useMagnetic(ref, { enabled: variant === "molten" });
  useEffect(
    () => () => {
      clearTimeout(backTimer.current);
    },
    [],
  );

  const roll = (): void => {
    const el = ref.current;
    if (!el || resultLabel === undefined) return;
    el.classList.add("ok");
    setRolled(true);
    clearTimeout(backTimer.current);
    backTimer.current = setTimeout(() => {
      onRollEnd?.();
      celebrating.current = false;
      el.classList.remove("ok");
      setRolled(false);
    }, resultMs);
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    if (loading) {
      e.preventDefault();
      return;
    }
    const el = ref.current;
    const point = { clientX: e.clientX, clientY: e.clientY };
    // One celebration per roll: a click while the result shows, or while an earlier async click is still
    // pending, doesn't celebrate again (design review M2).
    const showing = (el?.classList.contains("ok") ?? false) || celebrating.current;
    if (celebrates) celebrating.current = true;
    const result = onClick?.(e);
    if (resultLabel === undefined && !celebrates) return;
    onSettled(result, (ok) => {
      if (!ok || !ref.current) {
        if (!showing) celebrating.current = false;
        return;
      }
      if (celebrates && !showing)
        burstAt(ref.current, point, typeof celebrate === "object" ? celebrate.coins : undefined);
      roll();
    });
  };

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx(buttonClasses({ variant, size, block, className }), rolled && "ok")}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        // A key press ripples from the centre (pointer presses ripple from the finger, in usePress).
        if (flowing && !e.repeat && (e.key === "Enter" || e.key === " ") && ref.current)
          ripple(ref.current);
      }}
    >
      {variant === "ghost" ? (
        <span className="u">
          {children}
          {icon}
        </span>
      ) : resultLabel !== undefined ? (
        <span className="m-lbl">
          <span
            className="l1 inline-flex items-center justify-center gap-2"
            aria-hidden={rolled || undefined}
          >
            {icon}
            {children}
          </span>
          <span className="l2" aria-hidden={!rolled}>
            {resultLabel}
          </span>
        </span>
      ) : (
        // No roll: the label sits in the button as the reference's does (line-height 1, no grid).
        <span className="m-txt">
          {icon}
          {children}
        </span>
      )}
      {loading ? (
        <span className="m-busy">
          <Spinner />
        </span>
      ) : null}
    </button>
  );
}
