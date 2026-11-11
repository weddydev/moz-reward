"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";

/** Toggle: 120ms gold fill sweep (DESIGN §7). Controlled. 44px tall hit area. */
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
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="flex flex-col">
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
        disabled={disabled}
        onClick={() => {
          onCheckedChange(!checked);
        }}
        className={cx(
          "pressable rounded-pill border-line bg-surface-2 relative h-7 w-12 shrink-0 overflow-hidden border disabled:opacity-55",
        )}
      >
        <span
          aria-hidden="true"
          className="bg-gold-gradient duration-fast absolute inset-0 origin-left transition-transform ease-out"
          style={{ transform: checked ? "scaleX(1)" : "scaleX(0)" }}
        />
        <span
          aria-hidden="true"
          data-part="thumb"
          className="rounded-pill bg-surface shadow-1 duration-fast absolute top-0.5 left-0.5 size-[22px] transition-transform ease-out"
          style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}
