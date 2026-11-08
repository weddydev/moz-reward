"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Selectable chip (toggle button). Use in a <ChipGroup> with a label for screen readers. */
export function Chip({
  selected,
  onToggle,
  children,
  icon,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cx(
        "pressable rounded-pill text-small inline-flex h-10 items-center gap-1.5 border px-4 font-semibold whitespace-nowrap",
        selected ? "border-gold-500 bg-gold-100 text-ink" : "border-line bg-surface text-ink-2",
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
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "flex gap-2",
        wrap ? "flex-wrap" : "[scrollbar-width:none] overflow-x-auto overscroll-x-contain pb-1",
      )}
    >
      {children}
    </div>
  );
}
