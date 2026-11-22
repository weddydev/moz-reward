"use client";

import {
  type InputHTMLAttributes,
  type PointerEvent,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { cx } from "@/lib/cx";
import { anim } from "@/lib/motion/anim";
import { FIELD as FIELD_MOTION } from "@/lib/motion/controls";
import { type Common, describedBy, FIELD, FieldWrapper as Wrapper } from "./field";

/** Focus this soon after a press on the input counts as the tap's own focus. */
const TAP_FOCUS_MS = 1500;

// Layout effects only run in the browser.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Text field (PD-06; DESIGN §6.3, §7.4; reference `.field` + "input"): a 58 px ivory field whose label sits
 * inside it and floats up (.35 s spring) on focus, once it holds a value (typed, pasted or autofilled), or when
 * a placeholder is shown. A gold beam runs out from where you tapped (.55 s; the centre for keyboard focus). An
 * error turns the beam red, shakes the field (420 ms) when it appears or changes (or when `errorKey` changes, so
 * a form can shake it again on every failed submit) and sits below, linked by `aria-describedby` with the hint
 * and the caller's ids. `valid` draws a green tick (.4 s). Reduced motion: no shake; the beam and label move at
 * the reduced-motion length. `parity` marks the field for the parity harness.
 */
export function TextField({
  label,
  hint,
  error,
  errorKey,
  valid = false,
  className,
  id: idProp,
  parity,
  placeholder,
  onPointerDown,
  "aria-describedby": extraDescribedBy,
  ...input
}: Common &
  InputHTMLAttributes<HTMLInputElement> & {
    /** Changing it while `error` is set shakes the field again (e.g. a count of failed submits). */
    errorKey?: string | number;
    /** A value that passed its check: the tick draws itself. */
    valid?: boolean;
    parity?: string;
    /** The input itself (React 19 passes `ref` as a prop; it reaches the input with the other attributes). */
    ref?: React.Ref<HTMLInputElement>;
  }): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  const field = useRef<HTMLDivElement>(null);
  // When the last press on the input happened (event time): focus soon after a press is a tap (iOS focuses only
  // after the touch ends), anything else is keyboard focus.
  const pressedAt = useRef(Number.NEGATIVE_INFINITY);
  const shaken = useRef<{ error: string | undefined; key: string | number | undefined }>({
    error,
    key: errorKey,
  });

  // The shake follows the error the parent sets, never a keystroke on its own; none on the first render.
  useBrowserLayoutEffect(() => {
    const last = shaken.current;
    shaken.current = { error, key: errorKey };
    if (!error || (error === last.error && errorKey === last.key)) return;
    const el = field.current;
    if (!el || document.documentElement.classList.contains("rm")) return;
    for (const a of typeof el.getAnimations === "function" ? el.getAnimations() : []) a.cancel();
    anim(
      el,
      FIELD_MOTION.shakePx.map((x) => ({ transform: `translateX(${String(x)}px)` })),
      { duration: FIELD_MOTION.shakeMs, easing: "ease-out", fill: "none" },
    );
  }, [error, errorKey]);

  return (
    <div className={cx("m-field-wrap", className)}>
      <div
        ref={field}
        data-parity={parity}
        data-state={error ? "bad" : valid ? "good" : undefined}
        data-placeholder={placeholder ? "" : undefined}
        className="m-field"
      >
        <input
          {...input}
          id={id}
          // A blank placeholder lets CSS tell an empty field (`:placeholder-shown`) from one with a value.
          placeholder={placeholder ?? " "}
          onPointerDown={(e: PointerEvent<HTMLInputElement>) => {
            pressedAt.current = e.timeStamp;
            const r = e.currentTarget.getBoundingClientRect();
            if (r.width > 0)
              field.current?.style.setProperty(
                "--ox",
                `${String(((e.clientX - r.left) / r.width) * 100)}%`,
              );
            onPointerDown?.(e);
          }}
          onFocus={(e) => {
            // Keyboard focus (no press just before): the beam runs out from the centre.
            if (e.timeStamp - pressedAt.current > TAP_FOCUS_MS)
              field.current?.style.removeProperty("--ox");
            input.onFocus?.(e);
          }}
          aria-invalid={error ? true : input["aria-invalid"]}
          aria-describedby={describedBy(id, error, hint, extraDescribedBy)}
        />
        <label htmlFor={id}>{label}</label>
        <span aria-hidden="true" className="m-beam" />
        <svg aria-hidden="true" className="m-okmark" viewBox="0 0 24 24">
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </div>
      {error ? (
        <p id={`${id}-error`} className="m-field-msg m-field-err">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="m-field-msg">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  id: idProp,
  rows = 4,
  "aria-describedby": extraDescribedBy,
  ...input
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        {...input}
        id={id}
        rows={rows}
        className={cx(FIELD, "resize-y py-3 leading-normal")}
        aria-invalid={error ? true : input["aria-invalid"]}
        aria-describedby={describedBy(id, error, hint, extraDescribedBy)}
      />
    </Wrapper>
  );
}
