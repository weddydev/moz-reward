"use client";

import { type HTMLAttributes, type PointerEvent } from "react";
import { cx } from "@/lib/cx";
import { Card } from "./Card";

/**
 * Molten tile (C-75; DESIGN §6.1, §7.4 Placed card; reference `.tile`): a placed card with the gilded edge that
 * lifts on hover, a soft gold light following a fine pointer (`--mx` / `--my`, 320 px, .35 s), and a scroll-in
 * rise (`translateY(36px) scale(.975)` over entry 0–30%, scroll-driven, an enhancement only; none under reduced
 * motion). Padding 22, radius lg, a column with 16 px gaps; size and grid span come from `className`.
 */
export function Tile({
  className,
  onPointerMove,
  ...rest
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <Card
      variant="placed"
      gilded
      lift
      className={cx("m-tile", className)}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        onPointerMove?.(e);
        if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${String(e.clientX - r.left)}px`);
        e.currentTarget.style.setProperty("--my", `${String(e.clientY - r.top)}px`);
      }}
      {...rest}
    />
  );
}
