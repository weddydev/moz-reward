import { cx } from "@/lib/cx";

/** Loading placeholder: shimmer ≤ 1.2s, static under reduced motion. */
export function Skeleton({
  className,
  rounded = "md",
}: {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "pill";
}): React.JSX.Element {
  const r = { sm: "rounded-sm", md: "rounded-md", lg: "rounded-lg", pill: "rounded-pill" }[rounded];
  return <div aria-hidden="true" className={cx("skeleton", r, className)} />;
}
