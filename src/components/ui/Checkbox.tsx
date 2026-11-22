"use client";

import { type InputHTMLAttributes, useEffect, useId, useRef } from "react";
import { cx } from "@/lib/cx";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { SEAL } from "@/lib/motion/controls";
import { burst } from "@/lib/motion/fx";
import { useHydrated } from "@/lib/use-hydrated";
import { joinIds } from "./field";

/**
 * Seal checkbox (PD-05; DESIGN §6.3, §7.4; reference `.chk` + `.box`): a native checkbox drawn as a 28 px box,
 * pressed like a wax seal. Ticking squashes and pops the box (.72 → 1.2 → 1, 480 ms), floods it with gold from
 * the centre (.38 s), draws the tick (.3 s after .14 s), throws a ring (.6 s) and 10 sparks at 120 ms; unticking
 * settles in 220 ms and drains it. Reduced motion: the box changes with no pop, ring or sparks. The whole row is a
 * <label> (its hit area reaches 44 px tall), so a tap anywhere on it toggles. Description and error are linked
 * with aria-describedby (merged with the caller's). Controlled (`checked`) boxes are disabled until hydrated so
 * an early press is never undone (C-20); uncontrolled ones work without JS. `parity` marks the box for the
 * parity harness.
 */
export function Checkbox({
  label,
  description,
  error,
  checked,
  onCheckedChange,
  disabled,
  className,
  parity,
  id: idProp,
  "aria-describedby": extraDescribedBy,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> & {
  label: string;
  description?: string | undefined;
  error?: string | undefined;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  parity?: string;
}): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  const hydrated = useHydrated();
  const controlled = checked !== undefined;
  const box = useRef<HTMLSpanElement>(null);
  const sparkTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
    },
    [],
  );

  const seal = (on: boolean): void => {
    const el = box.current;
    if (!el || reducedMotionNow()) return;
    if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
    sparkTimer.current = null;
    if (!on) {
      anim(el, [{ transform: "scale(.88)" }, { transform: "scale(1)" }], {
        duration: SEAL.offMs,
        fill: "none",
      });
      return;
    }
    anim(
      el,
      [
        { transform: "scale(.72)" },
        { transform: "scale(1.2)", offset: 0.5 },
        { transform: "scale(1)" },
      ],
      { duration: SEAL.boxMs, easing: SEAL.boxEasing, fill: "none" },
    );
    // Restart the ring even if it is still running from a quick re-tick.
    el.classList.remove("burst");
    el.getBoundingClientRect(); // style flush, so the ring animation starts again
    el.classList.add("burst");
    const r = el.getBoundingClientRect();
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
    sparkTimer.current = window.setTimeout(() => {
      sparkTimer.current = null;
      burst(x, y, {
        type: "spark",
        count: SEAL.sparks,
        speed: SEAL.sparkSpeed,
        life: SEAL.sparkLife,
      });
    }, SEAL.sparkAtMs);
  };

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="m-chk select-none">
        <input
          {...input}
          id={id}
          type="checkbox"
          {...(controlled ? { checked } : {})}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            onCheckedChange?.(on);
            seal(on);
          }}
          disabled={disabled || (controlled && !hydrated)}
          // Named by the label text only: the row <label> also wraps the description.
          aria-labelledby={`${id}-l`}
          aria-invalid={error ? true : input["aria-invalid"]}
          aria-describedby={joinIds(
            description && `${id}-d`,
            error && `${id}-error`,
            extraDescribedBy,
          )}
          className="m-chk-input"
        />
        <span ref={box} aria-hidden="true" data-parity={parity} className="m-box">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.2 4.2L19 7" />
          </svg>
        </span>
        <span className="m-chk-text">
          <span id={`${id}-l`}>{label}</span>
          {description ? <small id={`${id}-d`}>{description}</small> : null}
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-small text-danger pl-[42px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
