"use client";

import { CircleAlert, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { springEasing, TOAST } from "@/lib/motion/controls";

/**
 * Toasts: call `toast("Saved")` from anywhere; render <Toaster /> once per shell.
 * At most three are visible; the rest wait in order and appear as slots free (none is dropped).
 * Molten obsidian toast (PD-04; DESIGN §7.4 Toast): springs in (520 ms), its coin spins 720° (800 ms), a metal
 * progress bar runs down over 3.6 s, then it falls away (260 ms). Timer and bar pause while the tab is hidden or
 * the toast is hovered/focused. Screen readers hear each toast once, when it appears: errors through a `role="alert"`
 * region, the rest through a polite `role="status"` one; both are cleared after a second so a later
 * re-render or virtual-cursor pass doesn't read them again. The visible list itself is not live.
 */
export type ToastTone = "info" | "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone; leaving: boolean };
type Snapshot = { visible: readonly ToastItem[]; polite: string; assertive: string };

const MAX_VISIBLE = 3;
const DURATION = TOAST.showMs;
const EXIT_MS = TOAST.outMs;
const ANNOUNCE_MS = 1000;

let queue: ToastItem[] = [];
let nextId = 1;
const announced = new Set<number>();
let snapshot: Snapshot = { visible: [], polite: "", assertive: "" };
let clearAnnouncement: ReturnType<typeof setTimeout> | undefined;
/** Set while toasts are arriving in the same moment (until the next timer tick). */
let burst: ReturnType<typeof setTimeout> | undefined;
/** Which regions got text in the current burst: only those may be added to. */
let burstWrote = { polite: false, assertive: false };
const listeners = new Set<() => void>();

function publish(): void {
  const visible = queue.slice(0, MAX_VISIBLE);
  const fresh = visible.filter((t) => !announced.has(t.id));
  let { polite, assertive } = snapshot;
  if (fresh.length > 0) {
    for (const t of fresh) announced.add(t.id);
    const say = (errors: boolean) =>
      fresh
        .filter((t) => (t.tone === "error") === errors)
        .map((t) => t.message)
        .join(" ");
    // Toasts fired in the same moment (one burst) are joined: replacing the text would drop the earlier
    // ones before a screen reader ever saw them. A toast that arrives later replaces the text instead:
    // the region is atomic, so adding to it would read the earlier toast a second time. A region with
    // nothing new is left untouched, and it is tracked per region: an error that opens a burst must not
    // make the polite region's older text look like part of it.
    const next = (region: "polite" | "assertive", now: string, more: string): string => {
      if (more === "") return now;
      const joined = burstWrote[region] && now !== "" ? `${now} ${more}` : more;
      burstWrote[region] = true;
      return joined;
    };
    polite = next("polite", polite, say(false));
    assertive = next("assertive", assertive, say(true));
    burst ??= setTimeout(() => {
      burst = undefined;
      burstWrote = { polite: false, assertive: false };
    }, 0);
    clearTimeout(clearAnnouncement);
    clearAnnouncement = setTimeout(() => {
      clearAnnouncement = undefined;
      snapshot = { ...snapshot, polite: "", assertive: "" };
      emit();
    }, ANNOUNCE_MS);
  }
  snapshot = { visible, polite, assertive };
  emit();
}

function emit(): void {
  listeners.forEach((l) => {
    l();
  });
}

export function toast(message: string, tone: ToastTone = "info"): number {
  const id = nextId++;
  queue = [...queue, { id, message, tone, leaving: false }];
  publish();
  return id;
}

/** Starts the exit; a second call for a toast already leaving, or an unknown id, does nothing. */
export function dismissToast(id: number): void {
  const item = queue.find((t) => t.id === id);
  if (!item || item.leaving) return;
  queue = queue.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  publish();
  setTimeout(() => {
    queue = queue.filter((t) => t.id !== id);
    announced.delete(id);
    publish();
  }, EXIT_MS);
}

/** Test helper. */
export function __resetToasts(): void {
  queue = [];
  announced.clear();
  clearTimeout(clearAnnouncement);
  clearAnnouncement = undefined;
  clearTimeout(burst);
  burst = undefined;
  burstWrote = { polite: false, assertive: false };
  snapshot = { visible: [], polite: "", assertive: "" };
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => snapshot;

function ToastView({ item }: { item: ToastItem }) {
  const ref = useRef<HTMLLIElement>(null);

  // In: 520 ms spring rise; the coin spins 720° over 800 ms (reference `toast()`). A layout effect, so the toast is
  // never painted before its entrance starts.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion (DESIGN §7.2): a fade replaces the rise and the coin holds still.
    if (reducedMotionNow()) {
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: TOAST.inMs });
      return;
    }
    anim(
      el,
      [
        { opacity: 0, transform: "translateY(24px) scale(.96)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: TOAST.inMs, easing: springEasing() },
    );
    anim(
      el.querySelector(".tc"),
      [{ transform: "rotateY(0) scale(.6)" }, { transform: "rotateY(720deg) scale(1)" }],
      { duration: TOAST.coinMs },
    );
  }, []);

  // Out: 260 ms fall and fade, then the store removes it.
  useEffect(() => {
    if (!item.leaving) return;
    anim(
      ref.current,
      reducedMotionNow()
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "translateY(12px)" },
          ],
      { duration: TOAST.outMs },
    );
  }, [item.leaving]);

  useEffect(() => {
    const el = ref.current;
    let remaining = DURATION;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The progress bar runs with the timer: paused whenever the timer is (hover, focus, hidden tab).
    // Not through anim(): under reduced motion it would shorten the bar to 150 ms; the bar stays still instead.
    const barEl = el?.querySelector(".bar2");
    const bar =
      barEl && typeof barEl.animate === "function" && !reducedMotionNow()
        ? barEl.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
            duration: DURATION,
            easing: "linear",
            fill: "both",
          })
        : null;
    bar?.pause();
    // Hover and focus pause independently: leaving one must not restart the timer while the other holds
    // (on touch screens every tap ends with pointerleave, while focus may still be inside).
    let hovered = false;
    let focused = false;
    const start = () => {
      if (hovered || focused || document.hidden || timer !== undefined) return;
      startedAt = Date.now();
      bar?.play();
      timer = setTimeout(() => {
        dismissToast(item.id);
      }, remaining);
    };
    const stop = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      bar?.pause();
      remaining -= Date.now() - startedAt;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const onPointerEnter = () => {
      hovered = true;
      stop();
    };
    const onPointerLeave = () => {
      hovered = false;
      start();
    };
    const onFocusIn = () => {
      focused = true;
      stop();
    };
    const onFocusOut = (e: FocusEvent) => {
      // Focus moving between the toast's own parts keeps it paused.
      if (e.relatedTarget instanceof Node && el?.contains(e.relatedTarget)) return;
      focused = false;
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    el?.addEventListener("pointerenter", onPointerEnter);
    el?.addEventListener("pointerleave", onPointerLeave);
    el?.addEventListener("focusin", onFocusIn);
    el?.addEventListener("focusout", onFocusOut);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      el?.removeEventListener("pointerenter", onPointerEnter);
      el?.removeEventListener("pointerleave", onPointerLeave);
      el?.removeEventListener("focusin", onFocusIn);
      el?.removeEventListener("focusout", onFocusOut);
    };
  }, [item.id]);

  return (
    <li ref={ref} data-leaving={item.leaving} data-tone={item.tone} className="m-toast">
      <span className="tc grid place-items-center" aria-hidden="true">
        {item.tone === "error" ? (
          <CircleAlert size={18} strokeWidth={1.8} className="text-ink" />
        ) : null}
      </span>
      <span data-part="message" className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {item.message}
      </span>
      {/* Hidden until focused: the toast at rest is the reference's, and a keyboard user can still dismiss it
          (focus also pauses the timer). Touch and mouse users see it go after 3.6 s, or hover to hold it. */}
      <button
        type="button"
        onClick={() => {
          dismissToast(item.id);
        }}
        className="m-toast-x"
        aria-label="Dismiss"
      >
        <X aria-hidden="true" size={16} strokeWidth={1.8} />
      </button>
      <span className="bar2" aria-hidden="true" />
    </li>
  );
}

export function Toaster({ parity }: { parity?: string } = {}): React.JSX.Element {
  const { visible, polite, assertive } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive}
      </div>
      {/* The stack positions itself (molten.css `.m-toasts`); on app shells it sits above the bottom nav. */}
      <section
        aria-label="Notifications"
        className="[--toast-bottom:max(var(--fixed-bottom),calc(20px+env(safe-area-inset-bottom,0px)))]"
      >
        <ol className="m-toasts" data-parity={parity}>
          {visible.map((t) => (
            <ToastView key={t.id} item={t} />
          ))}
        </ol>
      </section>
    </>
  );
}
