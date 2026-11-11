"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { joinIds } from "./field";

export type RadioOption<T extends string> = { value: T; label: string; description?: string };

/**
 * Radio group (DESIGN §6–7): a fieldset named by its legend, native radios (arrow keys and form submit come
 * from the platform), each row a <label> so the whole row is the target (min 44px tall). The group carries
 * aria-invalid and the error/hint (merged with the caller's aria-describedby). A controlled group (`value`)
 * is disabled until hydrated so an early press is never undone (C-20).
 */
export function RadioGroup<T extends string>({
  label,
  name,
  options,
  value,
  defaultValue,
  onChange,
  hint,
  error,
  disabled = false,
  className,
  "aria-describedby": extraDescribedBy,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<RadioOption<T>>;
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  hint?: string | undefined;
  error?: string | undefined;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}): React.JSX.Element {
  const id = useId();
  const hydrated = useHydrated();
  const controlled = value !== undefined;
  return (
    <fieldset
      role="radiogroup"
      aria-invalid={error ? true : undefined}
      aria-describedby={joinIds(
        error ? `${id}-error` : hint ? `${id}-hint` : undefined,
        extraDescribedBy,
      )}
      disabled={disabled || (controlled && !hydrated)}
      className={cx("m-0 flex min-w-0 flex-col border-0 p-0", disabled && "opacity-55", className)}
    >
      <legend className="text-small text-ink mb-1 p-0 font-semibold">{label}</legend>
      {options.map((o, i) => {
        // By position: a value may hold characters an id can't (spaces).
        const optionId = `${id}-${String(i)}`;
        return (
          <label
            key={o.value}
            htmlFor={optionId}
            className={cx(
              "flex min-h-11 items-start gap-3 py-2.5 select-none",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <span data-press className="relative mt-px grid size-6 shrink-0 place-items-center">
              <input
                id={optionId}
                type="radio"
                name={name}
                value={o.value}
                {...(controlled ? { checked: value === o.value } : {})}
                {...(defaultValue !== undefined && !controlled
                  ? { defaultChecked: defaultValue === o.value }
                  : {})}
                onChange={() => onChange?.(o.value)}
                // Named by the label text only: the row <label> also wraps the description.
                aria-labelledby={`${optionId}-l`}
                aria-describedby={o.description ? `${optionId}-d` : undefined}
                className="peer border-ink-3 bg-surface checked:border-gold-500 absolute inset-0 m-0 cursor-[inherit] appearance-none rounded-full border-2"
              />
              <span
                aria-hidden="true"
                className="bg-gold-gradient duration-fast pointer-events-none relative size-3 scale-0 rounded-full transition-transform ease-out peer-checked:scale-100"
              />
            </span>
            <span className="flex min-w-0 flex-col [overflow-wrap:break-word]">
              <span id={`${optionId}-l`} className="text-body font-semibold">
                {o.label}
              </span>
              {o.description ? (
                <span id={`${optionId}-d`} className="text-small text-ink-2">
                  {o.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
      {error ? (
        <p id={`${id}-error`} className="text-small text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-small text-ink-2">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
