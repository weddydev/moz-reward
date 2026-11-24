import { type FocusEvent, type PointerEvent, useEffect, useLayoutEffect, useRef } from "react";
import { anim } from "@/lib/motion/anim";
import { FIELD as FIELD_MOTION } from "@/lib/motion/controls";

/** Shared wiring for the Molten fields (TextField, TextArea, Select): label inside, error or hint below. */
export type Common = {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
};

/** Focus this soon after a press on the control counts as the tap's own focus. */
const TAP_FOCUS_MS = 1500;

// Layout effects only run in the browser.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * The field's motion (PD-06; reference `.field`, `.beam`): the error shake (420 ms) when the parent sets a new or
 * changed error, or a new `errorKey` (never on the first render, never under reduced motion), and the beam's
 * origin: the tap point on a press, the centre for keyboard focus. Spread `onPointerDown`/`onFocus` on the
 * control; the caller's own handlers still run.
 */
export function useFieldMotion<E extends Control>({
  error,
  errorKey,
  onPointerDown,
  onFocus,
}: {
  error: string | undefined;
  errorKey?: string | number | undefined;
  onPointerDown?: ((e: PointerEvent<E>) => void) | undefined;
  onFocus?: ((e: FocusEvent<E>) => void) | undefined;
}): {
  field: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (e: PointerEvent<E>) => void;
  onFocus: (e: FocusEvent<E>) => void;
} {
  const field = useRef<HTMLDivElement>(null);
  // When the last press on the control happened (event time): focus soon after a press is a tap (iOS focuses
  // only after the touch ends), anything else is keyboard focus.
  const pressedAt = useRef(Number.NEGATIVE_INFINITY);
  const shaken = useRef<{ error: string | undefined; key: string | number | undefined }>({
    error,
    key: errorKey,
  });

  // The shake follows the error the parent sets, never a keystroke on its own; none on the first render.
  useBrowserLayoutEffect(() => {
    const last = shaken.current;
    shaken.current = { error, key: errorKey };
    if (!error || (error === last.error && errorKey === last.key)) return;
    const el = field.current;
    if (!el || document.documentElement.classList.contains("rm")) return;
    for (const a of typeof el.getAnimations === "function" ? el.getAnimations() : []) a.cancel();
    anim(
      el,
      FIELD_MOTION.shakePx.map((x) => ({ transform: `translateX(${String(x)}px)` })),
      { duration: FIELD_MOTION.shakeMs, easing: "ease-out", fill: "none" },
    );
  }, [error, errorKey]);

  return {
    field,
    onPointerDown: (e) => {
      pressedAt.current = e.timeStamp;
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width > 0)
        field.current?.style.setProperty(
          "--ox",
          `${String(((e.clientX - r.left) / r.width) * 100)}%`,
        );
      onPointerDown?.(e);
    },
    onFocus: (e) => {
      // Keyboard focus (no press just before): the beam runs out from the centre.
      if (e.timeStamp - pressedAt.current > TAP_FOCUS_MS)
        field.current?.style.removeProperty("--ox");
      onFocus?.(e);
    },
  };
}

/** The line under a field: the error (red) when there is one, else the hint. */
export function FieldMessage({
  id,
  error,
  hint,
}: {
  id: string;
  error: string | undefined;
  hint: string | undefined;
}): React.JSX.Element | null {
  if (error)
    return (
      <p id={`${id}-error`} className="m-field-msg m-field-err">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={`${id}-hint`} className="m-field-msg">
        {hint}
      </p>
    );
  return null;
}

/** Space-separated id list without blanks; undefined when empty (so no empty attribute is rendered). */
export const joinIds = (...ids: ReadonlyArray<string | undefined | false>): string | undefined =>
  ids
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim())
    .join(" ") || undefined;

/** Own error (or hint) first, then the caller's ids; neither is dropped. */
export const describedBy = (
  id: string,
  error?: string,
  hint?: string,
  extra?: string,
): string | undefined => joinIds(error ? `${id}-error` : hint ? `${id}-hint` : undefined, extra);
