import { cx } from "@/lib/cx";

/** 4px gold progress bar (shop cards, vault). Value 0–1. Text label lives next to it, not inside. */
export function ProgressBar({
  value,
  label,
  className,
  height = 4,
}: {
  value: number;
  label: string;
  className?: string;
  height?: number;
}): React.JSX.Element {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cx("rounded-pill bg-surface-2 w-full overflow-hidden", className)}
      style={{ height }}
    >
      <div
        className="rounded-pill bg-gold-gradient h-full origin-left"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}
