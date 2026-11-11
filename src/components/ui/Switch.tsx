"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Toggle: 120ms gold fill sweep (DESIGN §7). Controlled. The whole row is the target: the button's
 * `::after` covers the row (so a tap anywhere on it, label included, toggles), and the label is linked for
 * assistive tech. Disabled until hydrated so an early press is never lost (C-20).
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}): React.JSX.Element {
  const id = useId();
  const hydrated = useHydrated();
  return (
    <div
      className={cx(
        "relative flex min-h-11 items-center justify-between gap-4",
        disabled && "opacity-55",
      )}
    >
      <div className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
        <label htmlFor={id} className="text-body font-semibold">
          {label}
        </label>
        {description ? (
          <span id={`${id}-d`} className="text-small text-ink-2">
            {description}
          </span>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled || !hydrated}
        onClick={() => {
          onCheckedChange(!checked);
        }}
        className={cx(
          "rounded-pill shrink-0 select-none after:absolute after:inset-0 after:content-['']",
          disabled && "cursor-not-allowed",
        )}
      >
        <span
          aria-hidden="true"
          data-part="track"
          data-press
          className="rounded-pill border-line bg-surface-2 relative block h-7 w-12 overflow-hidden border"
        >
          <span
            className="bg-gold-gradient duration-fast absolute inset-0 origin-left transition-transform ease-out"
            style={{ transform: checked ? "scaleX(1)" : "scaleX(0)" }}
          />
          <span
            data-part="thumb"
            className="rounded-pill bg-surface shadow-1 duration-fast absolute top-0.5 left-0.5 size-[22px] transition-transform ease-out"
            style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
          />
        </span>
      </button>
    </div>
  );
}
