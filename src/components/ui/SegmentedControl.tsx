"use client";

import { useRef } from "react";
import { cx } from "@/lib/cx";

/** Radio-style segmented control with arrow-key support. The thumb slides (220ms) via transform. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}): React.JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKeyDown(e: React.KeyboardEvent) {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    const target = options[next];
    if (!target) return;
    onChange(target.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="rounded-pill bg-surface-2 relative grid p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        data-part="thumb"
        className="rounded-pill bg-surface shadow-1 duration-base absolute top-1 bottom-1 left-1 transition-transform ease-out"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => {
            onChange(o.value);
          }}
          className={cx(
            "rounded-pill text-small duration-fast relative z-10 h-10 px-3 font-semibold transition-colors",
            o.value === value ? "text-ink" : "text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
