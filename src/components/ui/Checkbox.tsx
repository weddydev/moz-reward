"use client";

import { Check } from "lucide-react";
import { type InputHTMLAttributes, useId } from "react";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { joinIds } from "./field";

/**
 * Checkbox row (DESIGN §6–7): a native checkbox drawn as a 24px box with a 120ms gold fill sweep. The whole
 * row is a <label>, so a tap anywhere on it toggles (min 44px tall). Description and error are linked with
 * aria-describedby (merged with the caller's). Controlled (`checked`) boxes are disabled until hydrated so
 * an early press is never undone (C-20); uncontrolled ones work without JS.
 */
export function Checkbox({
  label,
  description,
  error,
  checked,
  onCheckedChange,
  disabled,
  className,
  id: idProp,
  "aria-describedby": extraDescribedBy,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> & {
  label: string;
  description?: string | undefined;
  error?: string | undefined;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  const hydrated = useHydrated();
  const controlled = checked !== undefined;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className={cx(
          "group flex min-h-11 items-start gap-3 py-2.5 select-none",
          disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
        )}
      >
        <span data-press className="relative mt-px grid size-6 shrink-0 place-items-center">
          <input
            {...input}
            id={id}
            type="checkbox"
            {...(controlled ? { checked } : {})}
            onChange={(e) => onCheckedChange?.(e.currentTarget.checked)}
            disabled={disabled || (controlled && !hydrated)}
            // Named by the label text only: the row <label> also wraps the description.
            aria-labelledby={`${id}-l`}
            aria-invalid={error ? true : input["aria-invalid"]}
            aria-describedby={joinIds(
              description && `${id}-d`,
              error && `${id}-error`,
              extraDescribedBy,
            )}
            className="peer border-ink-3 bg-surface checked:border-gold-500 aria-invalid:border-danger absolute inset-0 m-0 cursor-[inherit] appearance-none rounded-sm border-2"
          />
          <span
            aria-hidden="true"
            className="bg-gold-gradient duration-fast pointer-events-none absolute inset-0 origin-left scale-x-0 rounded-sm transition-transform ease-out peer-checked:scale-x-100"
          />
          <Check
            aria-hidden="true"
            size={16}
            strokeWidth={2.5}
            className="text-ink duration-fast pointer-events-none relative opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        <span className="flex min-w-0 flex-col [overflow-wrap:break-word]">
          <span id={`${id}-l`} className="text-body font-semibold">
            {label}
          </span>
          {description ? (
            <span id={`${id}-d`} className="text-small text-ink-2">
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-small text-danger pl-9">
          {error}
        </p>
      ) : null}
    </div>
  );
}
