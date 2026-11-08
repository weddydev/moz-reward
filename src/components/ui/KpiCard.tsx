import { TrendingDown, TrendingUp } from "lucide-react";
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
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-small text-ink-2">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="font-display tabular text-[28px] leading-none font-semibold">{value}</p>
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
