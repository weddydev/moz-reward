"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { STARS } from "@/lib/motion/controls";
import { burst } from "@/lib/motion/fx";
import { useHydrated } from "@/lib/use-hydrated";

// Layout effects only run in the browser.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const STAR_PATH = "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z";

/**
 * The two choices every rating gets, in this order and look (COMPLIANCE §1: no review gating). The second keeps
 * COMPLIANCE §1's wording, "Send to the shop privately", over the reference's "Send privately" (COMPLIANCE
 * outranks the reference; DECISIONS 23 Nov).
 */
export const RATING_CHOICES = ["Post on Google", "Send to the shop privately"] as const;
export type RatingChoice = (typeof RATING_CHOICES)[number];

/**
 * Star rating (PD-06; DESIGN §6.3, §7.4; reference `.stars` + "stars"; COMPLIANCE §1). Five stars in a radio
 * group. Choosing a rating ignites the stars up to it one after another (70 ms apart): each pops (480 ms) with
 * 7 sparks; the rating's word rises in after the last (300 ms), and the same two choices, "Post on Google" and
 * "Send to the shop privately", pop in (.5 s spring, the second .06 s later). Every rating, 1 to 5, gets exactly those two,
 * equal in look and order: nothing here depends on the rating but the word. Before a rating the choices hold
 * their space, invisible and inert. Fine pointers preview the stars under the pointer. Arrow keys move and
 * choose (Right/Down up a star, Left/Up down one; no wrap, like a scale) with one tab stop. The motion follows the value, so a parent that refuses a
 * rating gets none. Reduced motion: every star lights at once with no pop or sparks. Controlled; disabled until
 * hydrated so an early tap is never lost (C-20). `parity` marks the stars for the parity harness.
 */
export function StarRating({
  value,
  onChange,
  onChoice,
  label = "Rate your visit",
  parity,
  className,
}: {
  /** 0 = not rated yet, else 1–5. */
  value: number;
  onChange: (rating: number) => void;
  /** One of the two equal choices, with the rating it was made at. */
  onChoice?: (choice: RatingChoice, rating: number) => void;
  label?: string;
  parity?: string;
  className?: string;
}): React.JSX.Element {
  const hydrated = useHydrated();
  const gradient = `m-metal-${useId().replace(/:/g, "")}`;
  const stars = useRef<Array<HTMLButtonElement | null>>([]);
  const word = useRef<HTMLParagraphElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  // Stars lit on screen: the rating itself at rest, catching up star by star after a new rating.
  const [lit, setLit] = useState(value);
  const [preview, setPreview] = useState(0);
  const shown = useRef(value);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  useBrowserLayoutEffect(() => {
    const from = shown.current;
    shown.current = value;
    if (from === value) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    // Stars past the new rating go out at once; the ones up to it re-ignite in turn.
    setLit((n) => Math.min(n, value));
    const reduced = reducedMotionNow();
    for (let k = 0; k < value; k++) {
      timers.current.push(
        window.setTimeout(
          () => {
            setLit((n) => Math.max(n, k + 1));
            const star = stars.current[k];
            if (!star || reduced) return;
            anim(
              star,
              [
                { transform: "scale(.6) rotate(-20deg)" },
                { transform: "scale(1.3) rotate(8deg)", offset: 0.5 },
                { transform: "scale(1)" },
              ],
              { duration: STARS.popMs, easing: STARS.popEasing, fill: "none" },
            );
            const r = star.getBoundingClientRect();
            burst(r.left + r.width / 2, r.top + r.height / 2, {
              type: "spark",
              count: STARS.sparks,
              speed: STARS.sparkSpeed,
              life: STARS.sparkLife,
            });
          },
          reduced ? 0 : k * STARS.staggerMs,
        ),
      );
    }
    // Reduced motion: the word fades in, no rise (DESIGN §7.2).
    anim(
      word.current,
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "none" },
          ],
      { duration: STARS.labelMs, delay: value * STARS.staggerMs, fill: "backwards" },
    );
    // The two choices pop in again for every new rating (the same CSS animation, restarted).
    const el = actions.current;
    if (el && value > 0) {
      el.removeAttribute("data-show");
      el.getBoundingClientRect(); // style now, so the animation starts over
      el.setAttribute("data-show", "");
    }
  }, [value]);

  const choose = (rating: number): void => {
    if (rating !== value) onChange(rating);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    // WAI-ARIA radio group: Right/Down to the next star, Left/Up to the previous one.
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const n = Math.min(4, Math.max(0, (value || 1) - 1 + dir));
    stars.current[n]?.focus();
    choose(n + 1);
  };

  const tabStop = value > 0 ? value - 1 : 0;
  return (
    <div className={cx("m-rate", className)}>
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
      <div
        role="radiogroup"
        aria-label={label}
        data-parity={parity}
        className="m-stars"
        onKeyDown={onKeyDown}
        onPointerLeave={() => {
          setPreview(0);
        }}
      >
        {[1, 2, 3, 4, 5].map((n, k) => (
          <button
            key={n}
            ref={(el) => {
              stars.current[k] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={n === 1 ? "1 star" : `${String(n)} stars`}
            tabIndex={k === tabStop ? 0 : -1}
            disabled={!hydrated}
            className={cx("m-star", k < lit && "lit", k < preview && "pre")}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setPreview(n);
            }}
            onClick={() => {
              choose(n);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR_PATH} style={k < lit ? { fill: `url(#${gradient})` } : undefined} />
            </svg>
          </button>
        ))}
      </div>
      <p ref={word} className="m-rate-txt" aria-live="polite">
        {STARS.words[value] ?? STARS.words[0]}
      </p>
      <div
        ref={actions}
        className="m-rate-actions"
        data-show={value > 0 ? "" : undefined}
        // Before a rating the choices keep their space but can't be reached or pressed.
        inert={value === 0}
      >
        {RATING_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => {
              onChoice?.(choice, value);
            }}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}
