import { GildedEdge } from "@/components/motion/GildedEdge";
import { cx } from "@/lib/cx";
import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * `plain` (v1: surface, radius md, shadow-1; until PD-11 restyles the screens), `placed` (Molten: pearl fill,
   * gold hairline edge, inner bevel, layered lift; DESIGN §6.1) or `dark` (obsidian with a gold outline).
   */
  variant?: "plain" | "placed" | "dark";
  /** Molten hero cards: the gilded edge (gem, line, echo; DESIGN §6.2). The card must not clip. */
  gilded?: boolean;
  /** Lift 4 px with the deeper shadow on hover (fine pointer only). */
  lift?: boolean;
};

/** Surface card. Molten variants come from molten.css; their size, padding and radius come from `className`. */
export function Card({
  variant = "plain",
  gilded = false,
  lift = false,
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cx(
        variant === "plain" && "bg-surface shadow-1 rounded-md",
        variant === "placed" && "m-placed",
        variant === "dark" && "m-dark",
        className,
      )}
      data-lift={lift ? "" : undefined}
      {...rest}
    >
      {children}
      {gilded ? <GildedEdge /> : null}
    </div>
  );
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
