"use client";

import { ChevronDown } from "lucide-react";
import { type SelectHTMLAttributes, useId } from "react";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { type Common, describedBy, FieldMessage, useFieldMotion } from "./field";
import { Icon } from "./Icon";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * Native select in the Molten field language (PD-11; extended from the reference `.field`, which has no select):
 * the 58 px ivory field with its label floated (a select always shows a value), a chevron, the gold beam from the
 * tap point, the error shake and the message below. The platform picker is the best one on phones and fully
 * accessible; long option text is the platform's to wrap, the closed field truncates. A controlled select is
 * disabled until hydrated, so an early choice is never undone (C-20); an uncontrolled one keeps working without
 * JS (the browser keeps the value).
 */
export function Select({
  label,
  hint,
  error,
  errorKey,
  className,
  id: idProp,
  options,
  placeholder,
  onPointerDown,
  onFocus,
  "aria-describedby": extraDescribedBy,
  disabled,
  ...select
}: Common &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
    options: ReadonlyArray<SelectOption>;
    /** A first, unselectable "Choose…" option; pair with `value=""` or `defaultValue=""`. */
    placeholder?: string;
    /** Changing it while `error` is set shakes the field again. */
    errorKey?: string | number;
  }): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  const hydrated = useHydrated();
  const controlled = select.value !== undefined;
  const {
    field,
    onPointerDown: pointerDown,
    onFocus: focus,
  } = useFieldMotion<HTMLSelectElement>({ error, errorKey, onPointerDown, onFocus });
  return (
    <div className={cx("m-field-wrap", className)}>
      <div
        ref={field}
        data-state={error ? "bad" : undefined}
        data-placeholder=""
        className="m-field m-field-select"
      >
        <select
          {...select}
          id={id}
          disabled={disabled || (controlled && !hydrated)}
          onPointerDown={pointerDown}
          onFocus={focus}
          aria-invalid={error ? true : select["aria-invalid"]}
          aria-describedby={describedBy(id, error, hint, extraDescribedBy)}
        >
          {placeholder !== undefined ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <label htmlFor={id}>{label}</label>
        <span aria-hidden="true" className="m-field-chev">
          <Icon icon={ChevronDown} size={18} />
        </span>
        <span aria-hidden="true" className="m-beam" />
      </div>
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}
