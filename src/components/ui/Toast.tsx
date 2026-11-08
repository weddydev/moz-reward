"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";

/**
 * Toasts: call `toast("Saved")` from anywhere; render <Toaster /> once per shell.
 * Slide up 12px + fade, auto-dismiss after 4s; timers pause while the tab is hidden or the toast is hovered/focused.
 */
export type ToastTone = "info" | "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone; leaving: boolean };

const DURATION = 4000;
const EXIT_MS = 160;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, tone: ToastTone = "info"): number {
  const id = nextId++;
  items = [...items.slice(-2), { id, message, tone, leaving: false }]; // keep at most 3
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, EXIT_MS);
}

/** Test helper. */
export function __resetToasts() {
  items = [];
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;

function ToastView({ item }: { item: ToastItem }) {
  const remaining = useRef(DURATION);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const paused = useRef(false);

  useEffect(() => {
    const start = () => {
      if (paused.current || document.hidden) return;
      startedAt.current = Date.now();
      timer.current = setTimeout(() => dismissToast(item.id), remaining.current);
    };
    const stop = () => {
      if (timer.current === undefined) return;
      clearTimeout(timer.current);
      timer.current = undefined;
      remaining.current -= Date.now() - startedAt.current;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    const el = document.getElementById(`toast-${item.id}`);
    const pause = () => {
      paused.current = true;
      stop();
    };
    const resume = () => {
      paused.current = false;
      start();
    };
    el?.addEventListener("pointerenter", pause);
    el?.addEventListener("pointerleave", resume);
    el?.addEventListener("focusin", pause);
    el?.addEventListener("focusout", resume);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      el?.removeEventListener("pointerenter", pause);
      el?.removeEventListener("pointerleave", resume);
      el?.removeEventListener("focusin", pause);
      el?.removeEventListener("focusout", resume);
    };
  }, [item.id]);

  const Icon = ICON[item.tone];
  return (
    <li
      id={`toast-${item.id}`}
      data-leaving={item.leaving}
      className="toast bg-ink text-small text-surface shadow-2 pointer-events-auto flex w-full items-center gap-3 rounded-md py-3 pr-2 pl-4"
    >
      <Icon
        aria-hidden="true"
        size={18}
        strokeWidth={1.5}
        className={cx(
          item.tone === "success" && "text-gold-300",
          item.tone === "error" && "text-surface",
        )}
      />
      <span className="flex-1">{item.message}</span>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="pressable grid size-11 place-items-center rounded-sm"
        aria-label="Dismiss"
      >
        <X aria-hidden="true" size={16} strokeWidth={1.5} />
      </button>
    </li>
  );
}

export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+12px)] z-50 flex justify-center px-4 lg:bottom-6"
    >
      <ol className="flex w-full max-w-sm flex-col gap-2">
        {list.map((t) => (
          <ToastView key={t.id} item={t} />
        ))}
      </ol>
    </div>
  );
}
