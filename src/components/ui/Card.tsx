import { GildedEdge } from "@/components/motion/GildedEdge";
import { cx } from "@/lib/cx";
import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * `placed` (the default; Molten: pearl fill, gold hairline edge, inner bevel, layered lift; DESIGN §6.1) or
   * `dark` (obsidian with a gold outline). The v1 `plain` card and `HeroCard` were retired in PD-11: a hero is a
   * placed card with `gilded`.
   */
  variant?: "placed" | "dark";
  /** Molten hero cards: the gilded edge (gem, line, echo; DESIGN §6.2). The card must not clip. */
  gilded?: boolean;
  /** Lift 4 px with the deeper shadow on hover (fine pointer only). */
  lift?: boolean;
};

/**
 * Surface card. Molten variants come from molten.css; size and padding come from `className`. Placed and dark
 * cards take the reference's card radius (`.pcard`, 24 px) (`.m-card`, a components-layer rule, so
 * a `rounded-*` in `className` wins).
 */
export function Card({
  variant = "placed",
  gilded = false,
  lift = false,
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cx(variant === "placed" ? "m-placed" : "m-dark", "m-card", className)}
      data-lift={lift ? "" : undefined}
      {...rest}
    >
      {children}
      {gilded ? <GildedEdge /> : null}
    </div>
  );
}
