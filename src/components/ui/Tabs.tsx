"use client";

import { type ReactNode, useId, useRef } from "react";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";

export type TabItem<T extends string> = { value: T; label: string; count?: number };

/** WAI-ARIA tabs (manual activation on Enter/Space, arrows move focus+selection, Home/End). */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  children,
}: {
  label: string;
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}): React.JSX.Element {
  const base = useId();
  const hydrated = useHydrated();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    items.findIndex((t) => t.value === value),
  );

  function onKeyDown(e: React.KeyboardEvent) {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % items.length
        : e.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.value);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="border-line flex [scrollbar-width:none] gap-1 overflow-x-auto border-b"
      >
        {items.map((t, i) => {
          const selected = t.value === value;
          return (
            <button
              key={t.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${base}-tab-${t.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              // Disabled until hydrated so an early press is never lost (C-20).
              disabled={!hydrated}
              onClick={() => {
                onChange(t.value);
              }}
              className={cx(
                "text-small duration-fast relative h-11 min-w-11 shrink-0 px-3 font-semibold transition-colors",
                selected ? "text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {t.label}
              {t.count !== undefined ? (
                <span className="rounded-pill bg-surface-2 text-caption tabular ml-1.5 px-1.5">
                  {t.count}
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className="rounded-pill bg-gold-500 duration-base absolute inset-x-2 -bottom-px h-0.5 origin-center transition-transform ease-out"
                style={{ transform: selected ? "scaleX(1)" : "scaleX(0)" }}
              />
            </button>
          );
        })}
      </div>
      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${value}`}
        tabIndex={0}
        className="pt-4 focus-visible:rounded-sm"
      >
        {children}
      </div>
    </div>
  );
}
