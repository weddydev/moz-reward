"use client";

import { type ButtonHTMLAttributes, type MouseEvent, useId, useRef } from "react";
import { useChangeMotion } from "@/components/motion/useChangeMotion";
import { cx } from "@/lib/cx";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { HEART } from "@/lib/motion/controls";
import { Icon } from "./Icon";
import type { LucideIcon } from "lucide-react";

export type IconButtonVariant = "ghost" | "secondary" | "round";

/**
 * Icon-only button (DESIGN §6, §6.3, §13): the accessible name is the required `label` (no visible text).
 * `ghost` / `secondary`: 44 × 44 for headers and toolbars. `round` (PD-04; reference `.ico-btn`): the 54 px
 * pearl circle. With `pressed` it is a toggle (`aria-pressed`): turning on fills the icon with the metal
 * gradient and plays the heart burst (pop 620 ms, ring 600 ms, 10 gold and ember dots 650 ms; dots skipped
 * under reduced motion); turning off settles in 250 ms. `onPressedChange` gets the new state.
 */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  pressed,
  onPressedChange,
  className,
  type = "button",
  disabled,
  onClick,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "aria-pressed"> & {
  icon: LucideIcon;
  label: string;
  variant?: IconButtonVariant;
  /** Makes it a toggle button. */
  pressed?: boolean;
  onPressedChange?: (next: boolean) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  const gradient = `m-metal-${useId().replace(/:/g, "")}`;
  const toggle = pressed !== undefined;
  const Glyph = icon;

  // The burst follows the value (FOLLOWUPS 80): a parent that refuses the toggle gets none.
  const requestBurst = useChangeMotion(pressed === true, (on) => {
    const el = ref.current;
    if (el) burst(el, on);
  });

  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    onClick?.(e);
    if (!toggle || e.defaultPrevented) return;
    const next = !pressed;
    requestBurst(next);
    onPressedChange?.(next);
  };

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-label={label}
      aria-pressed={toggle ? pressed : undefined}
      onClick={handleClick}
      className={cx(
        variant === "round"
          ? "m-ico-btn"
          : "pressable text-ink inline-grid size-11 shrink-0 place-items-center rounded-md",
        variant === "ghost" && "hover:bg-surface-2 bg-transparent",
        variant === "secondary" && "bg-surface border-line shadow-lift-sm border",
        disabled && "cursor-not-allowed opacity-55",
        className,
      )}
    >
      {variant === "round" ? (
        <>
          <svg className="m-defs" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: "var(--metal-svg-0)" }} />
                <stop offset=".35" style={{ stopColor: "var(--metal-svg-1)" }} />
                <stop offset=".5" style={{ stopColor: "var(--metal-svg-2)" }} />
                <stop offset=".7" style={{ stopColor: "var(--metal-svg-3)" }} />
                <stop offset="1" style={{ stopColor: "var(--metal-svg-4)" }} />
              </linearGradient>
            </defs>
          </svg>
          <Glyph
            aria-hidden="true"
            size={24}
            strokeWidth={1.8}
            style={pressed ? { fill: `url(#${gradient})` } : undefined}
          />
          <span className="m-ring" aria-hidden="true" />
        </>
      ) : (
        <Icon icon={icon} />
      )}
    </button>
  );
}

/** The reference's save-heart burst on the button `el` (turning on), or the quick settle (turning off). */
function burst(el: HTMLElement, on: boolean): void {
  // Reduced motion (DESIGN §7.2): the fill changes, nothing pops, rings or flies.
  if (reducedMotionNow()) return;
  const svg = el.querySelector(":scope > svg:not(.m-defs)");
  if (!on) {
    anim(svg, [{ transform: "scale(.85)" }, { transform: "scale(1)" }], {
      duration: HEART.offMs,
      fill: "none",
    });
    return;
  }
  anim(
    svg,
    [
      { transform: "scale(.5)" },
      { transform: "scale(1.3)", offset: HEART.popOvershoot },
      { transform: "scale(.92)", offset: 0.75 },
      { transform: "scale(1)" },
    ],
    { duration: HEART.popMs, fill: "none" },
  );
  anim(
    el.querySelector(".m-ring"),
    [
      { opacity: 1, transform: "scale(.7)" },
      { opacity: 0, transform: "scale(1.7)" },
    ],
    { duration: HEART.ringMs, fill: "none" },
  );
  for (let i = 0; i < HEART.dots; i++) {
    const d = document.createElement("span");
    d.className = "m-dot";
    d.setAttribute("aria-hidden", "true");
    d.style.background = i % 2 ? "var(--gold-bright)" : "var(--ember)";
    el.appendChild(d);
    const a = (i / HEART.dots) * Math.PI * 2;
    const r = 38 + (i % 2) * 10;
    const an = anim(
      d,
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        {
          transform: `translate(${String(Math.cos(a) * r)}px,${String(Math.sin(a) * r)}px) scale(.2)`,
          opacity: 0,
        },
      ],
      { duration: HEART.dotsMs, delay: HEART.dotsDelayMs, fill: "none" },
    );
    if (an)
      an.onfinish = () => {
        d.remove();
      };
    else d.remove();
  }
}
