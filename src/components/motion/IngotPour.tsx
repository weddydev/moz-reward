"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Ingot, type IngotProps } from "@/components/ui/Ingot";
import { ingotFill, levelY } from "@/lib/loyalty/ingot";
import { type PourKind, pourSeenKey, pourTimeline } from "@/lib/motion/ingot";
import "./ingot-pour.css";

/**
 * The ingot pour (DESIGN §8.3; P1-08). Pours once per mount, when the ingot first becomes visible: 0.9 s with
 * the stream on the first view of this shop's ingot in the browser session, a 0.5 s rise on later views.
 * - Never blocks: the SVG takes no pointer events of its own, nothing waits for the pour, and a tap on the
 *   ingot skips to the end (`skip()` on tap, DESIGN §8).
 * - Ends at the final state, never later: scrolled out of view, tab hidden, reduced motion switched on (the
 *   Me toggle or the system) → every part finishes at once, and this mount never pours again.
 * - Reduced motion → the static picture, no movement.
 * - Before it runs (server HTML, pre-hydration, below the fold) the liquid is hidden by `ingot-pour.css`
 *   when scripts run and motion is on, so the pour starts from an empty mould without a flash of the
 *   final state; without scripts or with reduced motion the final picture shows at once.
 * - Progress changes after mount (a later live update) are announced in a polite live region.
 */
type Phase = "pending" | "run" | "done";

const readSeen = (key: string): boolean => {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return seenInMemory.has(key);
  }
};
const markSeen = (key: string): void => {
  seenInMemory.add(key);
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* storage blocked: this page's memory is enough */
  }
};
const seenInMemory = new Set<string>();

const motionOn = (): boolean =>
  getComputedStyle(document.documentElement).getPropertyValue("--motion-on").trim() !== "0";

export function IngotPour({
  seenKey,
  ...ingot
}: Omit<IngotProps, "animated" | "decorative"> & {
  /** Which ingot this is for the "first view in this session" rule (the shop id). */
  seenKey: string;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("pending");
  const [kind, setKind] = useState<PourKind | null>(null);
  const fill = ingotFill(ingot.gold, ingot.size);
  const empty = fill.fraction === 0;

  // Wait for the first time the ingot is on screen, then decide how it arrives.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const canAnimate =
      !empty &&
      typeof IntersectionObserver === "function" &&
      typeof el.animate === "function" &&
      motionOn();
    if (!canAnimate) {
      setPhase("done");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const key = pourSeenKey(seenKey);
        if (document.hidden || !motionOn()) {
          setPhase("done");
          return;
        }
        setKind(readSeen(key) ? "rise" : "pour");
        markSeen(key);
        setPhase("run");
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
    // Once per mount: a later progress change is a live update, not a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run the timeline before the frame that unhides the liquid is painted.
  useLayoutEffect(() => {
    const el = ref.current;
    if (phase !== "run" || !kind || !el) return;
    const level = levelY(fill.fraction);
    const running: Animation[] = [];
    for (const step of pourTimeline(kind, level)) {
      const part = el.querySelector(`[data-ingot-part="${step.part}"]`);
      if (part) running.push(part.animate(step.keyframes, step.options));
    }
    const finishAll = (): void => {
      for (const a of running) if (a.playState !== "finished") a.finish();
    };
    const onHidden = (): void => {
      if (document.hidden) finishAll();
    };
    const onReduced = (): void => {
      if (!motionOn()) finishAll();
    };
    const away = new IntersectionObserver((entries) => {
      if (entries.every((e) => !e.isIntersecting)) finishAll();
    });
    away.observe(el);
    const system = window.matchMedia("(prefers-reduced-motion: reduce)");
    const toggle = new MutationObserver(onReduced);
    toggle.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduce-motion"],
    });
    system.addEventListener("change", onReduced);
    document.addEventListener("visibilitychange", onHidden);
    el.addEventListener("pointerdown", finishAll, { passive: true });
    let live = true;
    void Promise.allSettled(running.map((a) => a.finished)).then(() => {
      if (live) setPhase("done");
    });
    return () => {
      live = false;
      away.disconnect();
      toggle.disconnect();
      system.removeEventListener("change", onReduced);
      document.removeEventListener("visibilitychange", onHidden);
      el.removeEventListener("pointerdown", finishAll);
      for (const a of running) a.cancel();
    };
    // The level is read once at the start; a live update mid-pour simply re-renders the resting picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, kind]);

  // Announce changes after the first render (never on page load: the image's own label says it then).
  const [announce, setAnnounce] = useState("");
  const previous = useRef(fill.label);
  useEffect(() => {
    if (fill.label === previous.current) return;
    previous.current = fill.label;
    setAnnounce(fill.label);
  }, [fill.label]);

  return (
    <div
      ref={ref}
      className="ingot-pour"
      data-ingot-state={phase}
      data-ingot-kind={kind ?? undefined}
    >
      <Ingot {...ingot} animated />
      <span className="sr-only" aria-live="polite" data-testid="ingot-live">
        {announce}
      </span>
    </div>
  );
}
