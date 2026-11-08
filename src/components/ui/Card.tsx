import { cx } from "@/lib/cx";
import type { HTMLAttributes } from "react";

/** Surface card: radius md, shadow-1. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cx("bg-surface shadow-1 rounded-md", className)} {...rest} />;
}

/** Hero card: radius lg with a subtle foil texture. */
export function HeroCard({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cx("foil bg-surface shadow-2 relative overflow-hidden rounded-lg", className)}
      {...rest}
    />
  );
}
