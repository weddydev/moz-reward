"use client";

import { ChevronDown } from "lucide-react";
import { type SelectHTMLAttributes, useId } from "react";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { type Common, describedBy, FIELD, FieldWrapper } from "./field";
import { Icon } from "./Icon";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * Native select styled like the other fields (48px, surface-2, chevron): the platform picker is the best
 * one on phones and fully accessible. Long option text is the platform's to wrap; the closed field
 * truncates. A controlled select is disabled until hydrated, so an early choice is never undone (C-20);
 * an uncontrolled one keeps working without JS (the browser keeps the value).
 */
export function Select({
  label,
  hint,
  error,
  className,
  id: idProp,
  options,
  placeholder,
  "aria-describedby": extraDescribedBy,
  disabled,
  ...select
}: Common &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
    options: ReadonlyArray<SelectOption>;
    /** A first, unselectable "Choose…" option; pair with `value=""` or `defaultValue=""`. */
    placeholder?: string;
  }): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  const hydrated = useHydrated();
  const controlled = select.value !== undefined;
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <select
          {...select}
          id={id}
          disabled={disabled || (controlled && !hydrated)}
          className={cx(
            FIELD,
            "h-12 appearance-none truncate pr-11",
            disabled && "cursor-not-allowed opacity-55",
          )}
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
        <span className="text-ink-2 pointer-events-none absolute inset-y-0 right-4 grid place-items-center">
          <Icon icon={ChevronDown} size={18} />
        </span>
      </div>
    </FieldWrapper>
  );
}
