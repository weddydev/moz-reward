import { cx } from "@/lib/cx";
import type { ReactNode } from "react";

export type BadgeTone =
  "open" | "closed" | "happy-hour" | "featured" | "private" | "business" | "neutral" | "warning";

const TONE: Record<BadgeTone, string> = {
  open: "bg-[color-mix(in_srgb,var(--success)_6%,white)] text-success",
  closed: "bg-surface-2 text-ink-2",
  "happy-hour": "bg-gold-100 text-ink",
  featured: "bg-ink text-surface",
  private: "bg-surface-2 text-ink",
  business: "bg-gold-100 text-ink",
  neutral: "bg-surface-2 text-ink-2",
  warning: "bg-[color-mix(in_srgb,var(--warning)_14%,white)] text-ink",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={cx(
        "rounded-pill text-caption inline-flex h-6 items-center gap-1 px-2.5 font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
