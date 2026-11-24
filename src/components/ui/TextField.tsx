"use client";

import { type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from "react";
import { cx } from "@/lib/cx";
import { type Common, describedBy, FieldMessage, useFieldMotion } from "./field";

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
  onFocus,
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
  const {
    field,
    onPointerDown: pointerDown,
    onFocus: focus,
  } = useFieldMotion<HTMLInputElement>({ error, errorKey, onPointerDown, onFocus });

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
          onPointerDown={pointerDown}
          onFocus={focus}
          aria-invalid={error ? true : input["aria-invalid"]}
          aria-describedby={describedBy(id, error, hint, extraDescribedBy)}
        />
        <label htmlFor={id}>{label}</label>
        <span aria-hidden="true" className="m-beam" />
        <svg aria-hidden="true" className="m-okmark" viewBox="0 0 24 24">
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </div>
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

/**
 * Text area (PD-11; extended from the reference `.field`, which has no multi-line field): the same ivory field,
 * floating label, beam, shake and message as `TextField`, growing to `rows` lines and resizable in height.
 */
export function TextArea({
  label,
  hint,
  error,
  errorKey,
  className,
  id: idProp,
  rows = 4,
  placeholder,
  onPointerDown,
  onFocus,
  "aria-describedby": extraDescribedBy,
  ...input
}: Common &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    /** Changing it while `error` is set shakes the field again. */
    errorKey?: string | number;
  }): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  const {
    field,
    onPointerDown: pointerDown,
    onFocus: focus,
  } = useFieldMotion<HTMLTextAreaElement>({ error, errorKey, onPointerDown, onFocus });
  return (
    <div className={cx("m-field-wrap", className)}>
      <div
        ref={field}
        data-state={error ? "bad" : undefined}
        data-placeholder={placeholder ? "" : undefined}
        className="m-field m-field-area"
      >
        <textarea
          {...input}
          id={id}
          rows={rows}
          placeholder={placeholder ?? " "}
          onPointerDown={pointerDown}
          onFocus={focus}
          aria-invalid={error ? true : input["aria-invalid"]}
          aria-describedby={describedBy(id, error, hint, extraDescribedBy)}
        />
        <label htmlFor={id}>{label}</label>
        <span aria-hidden="true" className="m-beam" />
      </div>
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}
