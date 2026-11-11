"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";
import { originCss, placePopover, transformOriginFor } from "@/lib/motion/presets";

type Phase = "closed" | "open" | "closing";

export type PopoverProps = {
  /** What the trigger button shows. */
  label: ReactNode;
  /** The popover's accessible name. */
  title: string;
  children: ReactNode;
  triggerClassName?: string;
  className?: string;
};

/**
 * A small non-modal popover anchored to its trigger (P0-10 AC 8, DESIGN §7). Placed below the trigger (above
 * when it doesn't fit), 16px inside the viewport, and it grows from the trigger: `transform-origin` comes from
 * `transformOriginFor` (the `.popover` preset: scale .95 + fade, `--dur-base`, never from 0). Closing plays
 * the exit, then unmounts; re-opening mid-exit reverses it from where it is (CSS transitions). Esc closes and
 * returns focus to the trigger; a press outside or focus leaving closes it.
 */
export function Popover({
  label,
  title,
  children,
  triggerClassName,
  className,
}: PopoverProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("closed");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus: boolean) => {
    setPhase((p) => (p === "open" ? "closing" : p));
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const t = trigger.getBoundingClientRect();
    // offsetWidth/Height ignore the running scale, so the box is its resting size.
    const size = { width: panel.offsetWidth, height: panel.offsetHeight };
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const { left, top, side } = placePopover(t, size, viewport);
    panel.style.left = `${String(left)}px`;
    panel.style.top = `${String(top)}px`;
    panel.dataset.side = side;
    panel.style.transformOrigin = originCss(transformOriginFor(t, { left, top, ...size }));
  }, []);

  // Open (or re-open mid-exit): position before the first paint, then move focus in.
  useLayoutEffect(() => {
    if (phase !== "open") return;
    place();
    panelRef.current?.focus({ preventScroll: true });
  }, [phase, place]);

  // Closing: let the exit transitions finish, then unmount. Re-opening cancels this (the promise is ignored).
  useLayoutEffect(() => {
    if (phase !== "closing") return;
    const panel = panelRef.current;
    let cancelled = false;
    const animations =
      panel && typeof panel.getAnimations === "function" ? panel.getAnimations() : [];
    void Promise.allSettled(animations.map((a) => a.finished)).then(() => {
      if (!cancelled) setPhase("closed");
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // While open: follow the trigger on scroll and resize; a press outside closes.
  useEffect(() => {
    if (phase !== "open") return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (panelRef.current?.contains(target) || triggerRef.current?.contains(target)))
        return;
      close(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, { capture: true });
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
    };
  }, [phase, place, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || phase !== "open") return;
    e.preventDefault();
    e.stopPropagation();
    close(true);
  };

  const onBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (!next) return; // focus left the window, or a click on nothing: the pointer handler decides
    if (panelRef.current?.contains(next) || triggerRef.current?.contains(next)) return;
    close(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={phase === "open"}
        aria-controls={phase === "closed" ? undefined : id}
        aria-haspopup="dialog"
        className={triggerClassName}
        onClick={() => {
          setPhase((p) => (p === "open" ? "closing" : "open"));
        }}
        onKeyDown={onKeyDown}
      >
        {label}
      </button>
      {phase === "closed"
        ? null
        : createPortal(
            <div
              ref={panelRef}
              id={id}
              role="dialog"
              aria-label={title}
              tabIndex={-1}
              data-state={phase}
              className={cx(
                // Shadow from `.popover` (one layer, same as its focus state), so focusing it animates nothing.
                "popover bg-surface border-line fixed top-0 left-0 z-50 rounded-md border p-4 outline-none",
                "max-w-[calc(100vw-32px)]",
                className,
              )}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
            >
              {children}
            </div>,
            document.body,
          )}
    </>
  );
}
