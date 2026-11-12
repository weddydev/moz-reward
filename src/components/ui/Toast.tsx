"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";

/**
 * Toasts: call `toast("Saved")` from anywhere; render <Toaster /> once per shell.
 * At most three are visible; the rest wait in order and appear as slots free (none is dropped).
 * Slide up 12px + fade, auto-dismiss after 4s; timers pause while the tab is hidden or the toast is
 * hovered/focused. Screen readers hear each toast once, when it appears: errors through a `role="alert"`
 * region, the rest through a polite `role="status"` one; both are cleared after a second so a later
 * re-render or virtual-cursor pass doesn't read them again. The visible list itself is not live.
 */
export type ToastTone = "info" | "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone; leaving: boolean };
type Snapshot = { visible: readonly ToastItem[]; polite: string; assertive: string };

const MAX_VISIBLE = 3;
const DURATION = 4000;
const EXIT_MS = 160;
const ANNOUNCE_MS = 1000;

let queue: ToastItem[] = [];
let nextId = 1;
const announced = new Set<number>();
let snapshot: Snapshot = { visible: [], polite: "", assertive: "" };
let clearAnnouncement: ReturnType<typeof setTimeout> | undefined;
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
    // Add to an announcement that is still up (toasts fired in the same moment): replacing it would drop
    // the earlier ones before a screen reader ever saw them.
    const pending = clearAnnouncement !== undefined;
    const join = (now: string, more: string): string =>
      [pending ? now : "", more].filter(Boolean).join(" ");
    polite = join(polite, say(false));
    assertive = join(assertive, say(true));
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
  snapshot = { visible: [], polite: "", assertive: "" };
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => snapshot;

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;

function ToastView({ item }: { item: ToastItem }) {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const el = ref.current;
    let remaining = DURATION;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Hover and focus pause independently: leaving one must not restart the timer while the other holds
    // (on touch screens every tap ends with pointerleave, while focus may still be inside).
    let hovered = false;
    let focused = false;
    const start = () => {
      if (hovered || focused || document.hidden || timer !== undefined) return;
      startedAt = Date.now();
      timer = setTimeout(() => {
        dismissToast(item.id);
      }, remaining);
    };
    const stop = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
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

  const Icon = ICON[item.tone];
  return (
    <li
      ref={ref}
      data-leaving={item.leaving}
      data-tone={item.tone}
      className="toast bg-ink text-small text-surface shadow-2 pointer-events-auto flex w-full items-center gap-3 rounded-md py-3 pr-2 pl-4"
    >
      <Icon
        aria-hidden="true"
        size={18}
        strokeWidth={1.5}
        className={cx(
          "shrink-0",
          item.tone === "success" && "text-gold-300",
          item.tone === "error" && "text-surface",
        )}
      />
      <span data-part="message" className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {item.message}
      </span>
      <button
        type="button"
        onClick={() => {
          dismissToast(item.id);
        }}
        className="pressable grid size-11 shrink-0 place-items-center rounded-sm"
        aria-label="Dismiss"
      >
        <X aria-hidden="true" size={16} strokeWidth={1.5} />
      </button>
    </li>
  );
}

export function Toaster(): React.JSX.Element {
  const { visible, polite, assertive } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive}
      </div>
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+12px)] z-50 flex justify-center px-4 lg:bottom-6"
      >
        <ol className="flex w-full max-w-sm flex-col gap-2">
          {visible.map((t) => (
            <ToastView key={t.id} item={t} />
          ))}
        </ol>
      </section>
    </>
  );
}
