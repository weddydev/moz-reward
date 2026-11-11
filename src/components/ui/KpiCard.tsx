import { TrendingDown, TrendingUp } from "lucide-react";
import { Fragment } from "react";
import { cx } from "@/lib/cx";
import { Card } from "./Card";
import { Sparkline } from "./Sparkline";

/** Dashboard KPI with optional change vs previous period and a sparkline. */
export function KpiCard({
  label,
  value,
  change,
  trend,
}: {
  label: string;
  value: string;
  /** e.g. "+12% vs last week" — always text, never colour alone. */
  change?: { text: string; direction: "up" | "down" | "flat" };
  trend?: ReadonlyArray<number>;
}): React.JSX.Element {
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-4">
      <p className="text-small text-ink-2 [overflow-wrap:anywhere]">{label}</p>
      {/* A long value (e.g. £1,234,567.89 in a two-column grid at 320px) wraps instead of overflowing, but
          only after a thousands separator: a number is never split inside a digit group. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <p className="text-h1 tabular min-w-0 [word-break:keep-all]">
          {breakAfterSeparators(value)}
        </p>
        {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
      </div>
      {change ? (
        <p
          className={cx(
            "text-caption flex items-center gap-1 font-semibold",
            change.direction === "down"
              ? "text-danger"
              : change.direction === "up"
                ? "text-success"
                : "text-ink-2",
          )}
        >
          {change.direction === "up" ? (
            <TrendingUp aria-hidden="true" size={14} strokeWidth={1.5} />
          ) : null}
          {change.direction === "down" ? (
            <TrendingDown aria-hidden="true" size={14} strokeWidth={1.5} />
          ) : null}
          {change.text}
        </p>
      ) : null}
    </Card>
  );
}

/** "£1,234,567.89" → "£1," <wbr> "234," <wbr> "567.89": the only places the value may wrap. */
function breakAfterSeparators(value: string): React.ReactNode {
  const parts = value.split(",");
  if (parts.length === 1) return value;
  return parts.map((part, i) => (
    // Index keys are stable here: the parts of one string, in order.

    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <>
          ,<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}
