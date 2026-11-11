"use client";

import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import type { ReactNode } from "react";

/**
 * Selectable chip (toggle button). Use in a <ChipGroup> with a label for screen readers.
 * 40px tall, 44px hit area; disabled until hydrated so an early press is never lost (C-20).
 */
export function Chip({
  selected,
  onToggle,
  children,
  icon,
  disabled = false,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}): React.JSX.Element {
  const hydrated = useHydrated();
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled || !hydrated}
      onClick={onToggle}
      className={cx(
        "pressable hit-44 rounded-pill text-small inline-flex h-10 shrink-0 items-center gap-1.5 border px-4 font-semibold whitespace-nowrap",
        selected ? "border-gold-500 bg-gold-100 text-ink" : "border-line bg-surface text-ink-2",
        disabled && "cursor-not-allowed opacity-55",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function ChipGroup({
  label,
  children,
  wrap = true,
}: {
  label: string;
  children: ReactNode;
  wrap?: boolean;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "flex gap-2",
        // Not wrapping: scrolls inside itself; py keeps the 44px hit areas inside the scroll box.
        wrap ? "flex-wrap" : "[scrollbar-width:none] overflow-x-auto overscroll-x-contain py-0.5",
      )}
    >
      {children}
    </div>
  );
}
