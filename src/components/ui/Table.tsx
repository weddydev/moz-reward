"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { Skeleton } from "./Skeleton";

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  /** Numeric columns use tabular figures. */
  numeric?: boolean;
  /**
   * CSS width (e.g. "8rem"). When columns give widths the table uses a fixed layout, so the columns sit at
   * the same places while loading, empty and full: nothing shifts sideways when data arrives (AC 9). The
   * table still grows past its region (which then scrolls) when the widths add up to more.
   */
  width?: string;
};

export type Density = "comfortable" | "compact";
/** Which sides of the scroll region have more content: drives the edge shadows (C-13). */
export type Overflow = "none" | "start" | "end" | "both";

/** Pure, so the hint rule is unit-tested without layout: 1px slack absorbs sub-pixel scroll positions. */
export function overflowSides(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): Overflow {
  const start = scrollLeft > 1;
  const end = scrollLeft + clientWidth < scrollWidth - 1;
  return start && end ? "both" : start ? "start" : end ? "end" : "none";
}

/** Grabbing text in a row shouldn't open it, and nor should a click on a control of its own inside a cell. */
function isOwnRowClick(e: React.MouseEvent<HTMLTableRowElement>): boolean {
  const target = e.target as Element;
  const control = target.closest("a, button, input, select, textarea, label, [role='button']");
  if (control && !control.hasAttribute("data-row-action")) return false;
  const selection = window.getSelection();
  return !(selection && !selection.isCollapsed && e.currentTarget.contains(selection.anchorNode));
}

const PAD_Y: Record<Density, string> = { comfortable: "py-3", compact: "py-1.5" };
/**
 * One minimum height for data and loading rows: padding + a 28px line box. A one-line cell needs 20–24px,
 * but mixed inline content (the row button, a mono span) can make the line box a pixel or two taller where
 * the fallback mono font has larger metrics (Linux CI: data rows were 49px against 48px skeleton rows). The
 * 4px of headroom keeps every one-line row at exactly the minimum, so data replacing skeletons never shifts
 * the layout (AC 9).
 */
const ROW_H: Record<Density, string> = { comfortable: "h-13", compact: "h-10" };

/**
 * Dashboard table (DESIGN §6): sticky header inside its own scroll region, row hover (pointer devices),
 * comfortable/compact density, empty row, skeleton rows while loading (same height as data rows, so nothing
 * shifts when data arrives), and a horizontal-scroll hint on the side that has more content.
 * Rows with an action get a real button in the first cell (named by `rowLabel`), so they are reachable by
 * Tab and run with Enter or Space; a click anywhere else on the row runs the same action once.
 * The toggle and row buttons are disabled until hydrated so an early press is never lost (C-20).
 */
export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  onRowClick,
  rowLabel,
  empty,
  loading = false,
  loadingRows = 5,
}: {
  caption: string;
  columns: ReadonlyArray<Column<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  /** Accessible name of a row's action, e.g. `Open Aisha Khan`. Required with `onRowClick`. */
  rowLabel?: (row: Row) => string;
  empty?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
}): React.JSX.Element {
  const hydrated = useHydrated();
  const [density, setDensity] = useState<Density>("comfortable");
  const [overflow, setOverflow] = useState<Overflow>("none");
  const scroller = useRef<HTMLDivElement>(null);
  const compact = density === "compact";

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setOverflow(overflowSides(el.scrollLeft, el.scrollWidth, el.clientWidth));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(el);
    const table = el.firstElementChild;
    if (table) observer?.observe(table);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  const action = onRowClick;
  const fixedLayout = columns.some((c) => c.width !== undefined);
  return (
    <div className="border-line bg-surface min-w-0 overflow-hidden rounded-md border">
      <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-2">
        <p className="text-small min-w-0 font-semibold [overflow-wrap:anywhere]">{caption}</p>
        <button
          type="button"
          aria-pressed={compact}
          disabled={!hydrated}
          onClick={() => {
            setDensity((d) => (d === "compact" ? "comfortable" : "compact"));
          }}
          className="pressable hit-44 text-caption text-ink-2 h-9 shrink-0 rounded-sm px-3 font-semibold"
        >
          Compact rows
        </button>
      </div>
      <div className="relative">
        <div
          ref={scroller}
          role="region"
          aria-label={caption}
          aria-busy={loading || undefined}
          tabIndex={0}
          data-overflow={overflow}
          className="@container max-h-[70dvh] overflow-auto overscroll-contain"
        >
          {loading ? <p className="sr-only">Loading {caption}</p> : null}
          <table
            data-density={density}
            className={cx("text-small w-full border-collapse", fixedLayout && "table-fixed")}
          >
            <caption className="sr-only">{caption}</caption>
            {fixedLayout ? (
              <colgroup>
                {columns.map((c) => (
                  <col key={c.key} style={c.width ? { width: c.width } : undefined} />
                ))}
              </colgroup>
            ) : null}
            <thead className="bg-surface-2 sticky top-0 z-10">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cx(
                      "text-ink-2 px-4 py-2.5 font-semibold whitespace-nowrap",
                      c.align === "right" || c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: loadingRows }, (_, i) => (
                  <tr
                    key={i}
                    data-part="loading-row"
                    aria-hidden="true"
                    className={cx("border-line border-t", ROW_H[density])}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cx("px-4", PAD_Y[density])}>
                        {/* One line of text-small (14px × 1.4 ≈ 20px): the same height as a data row. */}
                        <div className="flex h-5 items-center">
                          <Skeleton
                            rounded="sm"
                            className={cx("h-3", c.numeric ? "ml-auto w-10" : "w-3/4 min-w-12")}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    {/* Pinned to the visible width of the scroll region (`100cqw`), so the message is
                        never cut off when the columns make the table wider than the screen. */}
                    <div className="text-ink-2 sticky left-0 w-[100cqw] p-6 text-center">
                      {empty ?? "Nothing here yet."}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={
                      action
                        ? (e) => {
                            if (hydrated && isOwnRowClick(e)) action(row);
                          }
                        : undefined
                    }
                    className={cx(
                      "border-line duration-fast hover:bg-gold-100/40 border-t transition-colors",
                      ROW_H[density],
                      action && "cursor-pointer",
                    )}
                  >
                    {columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={cx(
                          "px-4",
                          PAD_Y[density],
                          (c.align === "right" || c.numeric) && "text-right",
                          c.numeric && "tabular",
                        )}
                      >
                        {action && i === 0 ? (
                          // The click bubbles to the row, which runs the action once.
                          <button
                            type="button"
                            data-row-action=""
                            disabled={!hydrated}
                            aria-label={rowLabel?.(row)}
                            className="hit-44 text-left font-semibold [overflow-wrap:break-word] hover:underline"
                          >
                            {c.cell(row)}
                          </button>
                        ) : (
                          c.cell(row)
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <span
          aria-hidden="true"
          data-part="scroll-hint-start"
          className={cx(
            "duration-fast from-ink/10 pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r to-transparent transition-opacity",
            overflow === "start" || overflow === "both" ? "opacity-100" : "opacity-0",
          )}
        />
        <span
          aria-hidden="true"
          data-part="scroll-hint-end"
          className={cx(
            "duration-fast from-ink/10 pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l to-transparent transition-opacity",
            overflow === "end" || overflow === "both" ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
