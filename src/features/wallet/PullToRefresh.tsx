"use client";

import "./pull-to-refresh.css";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { pullDistance, PULL_MAX, PULL_THRESHOLD } from "./pull";

/**
 * Wallet pull-to-refresh on phones (P1-07, DESIGN §15 screen 3): pulling down at the top of the page draws an
 * ingot outline that fills as you pull; letting go past the threshold re-renders the page on the server
 * (`router.refresh()`), keeping scroll and state. Touch listeners are passive and never call preventDefault,
 * so scrolling is never blocked (mobile-native §6); the page's own overscroll is switched off while the Wallet
 * is open, so Android's browser refresh and iOS rubber-banding don't fight it. The pull is drawn through a CSS
 * variable on one element (no React render per frame). Only touch input at the top of the page starts a pull;
 * mouse and pen never do. Under reduced motion the outline fades in place instead of moving.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const indicator = useRef<HTMLDivElement>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";
    let startY: number | null = null;
    let pulled = 0;

    const draw = (px: number, dragging = false): void => {
      const el = indicator.current;
      if (!el) return;
      el.dataset.dragging = dragging ? "true" : "false";
      el.style.setProperty("--pull", String(px));
      el.style.setProperty("--pull-fill", String(Math.min(1, px / PULL_THRESHOLD)));
      el.dataset.armed = px >= PULL_THRESHOLD ? "true" : "false";
      el.dataset.pulling = px > 0 ? "true" : "false";
    };

    const onStart = (e: TouchEvent): void => {
      if (refreshingRef.current || e.touches.length !== 1 || window.scrollY > 0) {
        startY = null;
        return;
      }
      startY = e.touches[0]?.clientY ?? null;
      pulled = 0;
    };
    const onMove = (e: TouchEvent): void => {
      if (startY === null) return;
      const y = e.touches[0]?.clientY;
      if (y === undefined || window.scrollY > 0) {
        startY = null;
        draw(0);
        return;
      }
      pulled = pullDistance(y - startY);
      draw(pulled, true);
    };
    const onEnd = (): void => {
      if (startY === null) return;
      startY = null;
      if (pulled >= PULL_THRESHOLD) {
        draw(PULL_THRESHOLD);
        startTransition(() => {
          router.refresh();
        });
      } else {
        draw(0);
      }
      pulled = 0;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      root.style.overscrollBehaviorY = previous;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  // Keeps the listeners' view of `refreshing` current; when a refresh finishes, puts the outline away.
  useEffect(() => {
    refreshingRef.current = refreshing;
    if (refreshing) return;
    const el = indicator.current;
    if (!el || el.dataset.pulling !== "true") return;
    el.style.setProperty("--pull", "0");
    el.style.setProperty("--pull-fill", "0");
    el.dataset.armed = "false";
    el.dataset.pulling = "false";
  }, [refreshing]);

  return (
    // aria-busy while the server re-render runs; no live region here (it would sit inside the sliding route
    // content, P0-12 portal layouts): the refreshed list itself is the result.
    <div className="relative" aria-busy={refreshing || undefined}>
      <div
        ref={indicator}
        aria-hidden="true"
        data-testid="pull-indicator"
        data-refreshing={refreshing || undefined}
        className="pull-indicator md:hidden"
        style={{ "--pull-max": PULL_MAX } as React.CSSProperties}
      >
        <svg viewBox="0 0 40 28" width="40" height="28" fill="none">
          <defs>
            <clipPath id="pull-ingot-clip">
              <path d="M8 4h24l6 20H2z" />
            </clipPath>
          </defs>
          <g clipPath="url(#pull-ingot-clip)">
            <rect className="pull-indicator-fill" x="0" y="0" width="40" height="28" />
          </g>
          <path
            d="M8 4h24l6 20H2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {children}
    </div>
  );
}
