"use client";

import { useEffect, useId, useRef } from "react";
import { cx } from "@/lib/cx";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { SWITCH } from "@/lib/motion/controls";
import { burst } from "@/lib/motion/fx";
import { useHydrated } from "@/lib/use-hydrated";

const RING = "inset 0 2px 6px rgba(90,60,10,.2),inset 0 0 0 1px rgba(178,128,28,.35)";

/**
 * Coin switch (PD-05; DESIGN §6.3, §7.4; reference `.trow` + `.tgl`). Controlled, `role="switch"`. The knob is
 * a coin: turning on, it rolls across (.7 s spring, 30 px + 360°), flips from M to a tick (.5 s after .18 s)
 * while liquid gold pours in behind it (.6 s), and lands with 16 sparks and a gold pulse at 420 ms; turning off
 * drains it back. All of it is CSS transitions, so rapid toggling retargets instead of queueing; a landing still
 * pending when it turns off again is cancelled. Reduced motion: the state changes with no roll, pour or sparks.
 * The whole row is the target (the button's `::after` covers it) and the label names the switch. Disabled until
 * hydrated so an early press is never lost (C-20). `parity` marks the visual switch for the parity harness.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  parity,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  parity?: string;
}): React.JSX.Element {
  const id = useId();
  const hydrated = useHydrated();
  const track = useRef<HTMLSpanElement>(null);
  const landing = useRef<number | null>(null);

  const cancelLanding = (): void => {
    if (landing.current !== null) window.clearTimeout(landing.current);
    landing.current = null;
  };
  useEffect(() => cancelLanding, []);

  const land = (): void => {
    landing.current = null;
    const el = track.current;
    const coin = el?.querySelector(".m-tgl-coin");
    if (!el || !coin) return;
    const r = coin.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, {
      type: "spark",
      count: SWITCH.sparks,
      speed: SWITCH.sparkSpeed,
    });
    anim(
      el,
      [
        { boxShadow: `${RING},0 0 0 0 rgba(255,201,60,.7)` },
        { boxShadow: `${RING},0 0 0 14px rgba(255,201,60,0)` },
      ],
      { duration: SWITCH.pulseMs, fill: "none" },
    );
  };

  return (
    <div className={cx("m-trow", disabled && "opacity-55")}>
      <div className="m-trow-text">
        <label htmlFor={id} className="m-trow-label">
          {label}
        </label>
        {description ? (
          <span id={`${id}-d`} className="m-trow-s">
            {description}
          </span>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled || !hydrated}
        onClick={() => {
          const next = !checked;
          onCheckedChange(next);
          cancelLanding();
          // Reduced motion: no sparks or pulse (DESIGN §7.2).
          if (next && !reducedMotionNow()) landing.current = window.setTimeout(land, SWITCH.landMs);
        }}
        className="m-tgl-btn"
      >
        <span
          ref={track}
          aria-hidden="true"
          data-part="track"
          data-parity={parity}
          className="m-tgl"
        >
          <span className="m-tgl-fill" />
          <span className="m-tgl-coin" data-part="thumb">
            <span className="m-coin-in">
              <span className="m-face m-f1">M</span>
              <span className="m-face m-f2">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12.5l4.2 4.2L19 7" />
                </svg>
              </span>
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
