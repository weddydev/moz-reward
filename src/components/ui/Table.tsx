"use client";

import { type ReactNode, useState } from "react";
import { cx } from "@/lib/cx";

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  /** Numeric columns use tabular figures. */
  numeric?: boolean;
};

/** Dashboard table: sticky header, row hover (pointer devices), comfortable/compact density toggle. */
export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
}: {
  caption: string;
  columns: ReadonlyArray<Column<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  empty?: ReactNode;
}): React.JSX.Element {
  const [compact, setCompact] = useState(false);
  return (
    <div className="border-line bg-surface overflow-hidden rounded-md border">
      <div className="border-line flex items-center justify-between border-b px-4 py-2">
        <p className="text-small font-semibold">{caption}</p>
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => {
            setCompact((c) => !c);
          }}
          className="pressable text-caption text-ink-2 h-9 rounded-sm px-3 font-semibold"
        >
          {compact ? "Comfortable" : "Compact"}
        </button>
      </div>
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="max-h-[70vh] overflow-auto overscroll-contain"
      >
        <table className="text-small w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  {empty ?? <p className="text-ink-2 p-6 text-center">Nothing here yet.</p>}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={
                    onRowClick
                      ? () => {
                          onRowClick(row);
                        }
                      : undefined
                  }
                  className={cx(
                    "border-line duration-fast [@media(hover:hover)]:hover:bg-gold-100/40 border-t transition-colors",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cx(
                        "px-4",
                        compact ? "py-1.5" : "py-3",
                        (c.align === "right" || c.numeric) && "text-right",
                        c.numeric && "tabular",
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
