"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Ingot, type IngotProps } from "@/components/ui/Ingot";
import { cx } from "@/lib/cx";
import { ingotFill, levelY } from "@/lib/loyalty/ingot";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { burst } from "@/lib/motion/fx";
import {
  levelAt,
  POUR,
  type PourKind,
  type PourStep,
  pourSeenKey,
  pourSteps,
  pourTimeline,
  streamFoot,
} from "@/lib/motion/ingot";
import { formatCount } from "@/lib/motion/press";
import { ringKeyframes, VAULT } from "@/lib/motion/vault";
import { usePauseOffscreen } from "./usePauseOffscreen";
import "./ingot-pour.css";

/**
 * The ingot pour (DESIGN §8.3; P1-08, the reference vault's timing since PD-10).
 * - First view of this shop's ingot in the browser session: 200 ms after it shows, 0 → level in 900 ms with the
 *   pour stream; later views a 500 ms rise. Then the glint along the surface.
 * - Gold arriving after that (a live update, the demo's buttons): the level pours up in 1 s (1.5 s to the top)
 *   with the stream, splash sparks and a "+N" stamp; reaching the top calls `onFull` 250 ms after it lands. A
 *   completed ingot with gold to spare (multi-ingot overflow) shows full for `VAULT.unlock.holdMs`, then the new
 *   ingot starts empty and takes the rest. Less gold drains in 600 ms.
 * - `unlocked` and a full ingot on show: the ingot lifts and its top face turns gold; turning true after mount also
 *   plays the ring pulse and the coin and spark burst (the reward moment's ingot half; `GoldVault` has the rest).
 * - Never blocks: the SVG takes no pointer events of its own, nothing waits for the pour, and a tap on the ingot
 *   skips to the end. Ends at the final state, never later: scrolled out of view, tab hidden, reduced motion
 *   switched on → every part finishes at once (queued steps too; `onFull` is still called).
 * - Reduced motion → the static picture, no movement; `onFull` at once.
 * - `count`: an element whose single text node shows the gold; it counts with the liquid (the vault's number).
 * - Progress changes after mount are announced in a polite live region.
 */
type Phase = "pending" | "run" | "done";
type Play = { id: number; step: PourStep; delay: number; queue: PourStep[] };

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

/** Writes `n` into `el`'s single text node (React keeps its node) or its text. */
function writeCount(el: Element | null | undefined, n: number): void {
  if (!el) return;
  const only = el.childNodes.length === 1 ? el.firstChild : null;
  if (only && only.nodeType === Node.TEXT_NODE) only.nodeValue = formatCount(n);
  else el.textContent = formatCount(n);
}

export function IngotPour({
  seenKey,
  ingots = 0,
  unlocked = false,
  onFull,
  onLanded,
  count,
  className,
  ...ingot
}: Omit<IngotProps, "animated" | "decorative" | "topGold"> & {
  /** Which ingot this is for the "first view in this session" rule (the shop id). */
  seenKey: string;
  /** Ingots completed so far: a rise with `gold` lower than before is an overflow into a new ingot. */
  ingots?: number;
  /** A reward is ready: with a full ingot on show, it lifts and its top face is gold. */
  unlocked?: boolean;
  /** Called 250 ms after a pour lands at the top (at once when skipped or under reduced motion). */
  onFull?: (() => void) | undefined;
  /** Called with the gold shown each time a pour lands (the vault's "N gold to go" line follows it). */
  onLanded?: (gold: number) => void;
  count?: RefObject<HTMLElement | null>;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<Phase>("pending");
  const [kind, setKind] = useState<PourKind | null>(null);
  const [shown, setShown] = useState(ingot.gold);
  const [stampText, setStampText] = useState("");
  const [play, setPlay] = useState<Play | null>(null);
  const seen = useRef(false);
  const onScreen = useRef(false);
  const playId = useRef(0);
  const timers = useRef<number[]>([]);
  const land = useRef<() => void>(() => undefined);
  const fullRef = useRef(onFull);
  const landedRef = useRef(onLanded);
  useLayoutEffect(() => {
    fullRef.current = onFull;
    landedRef.current = onLanded;
  });
  const prev = useRef({ gold: ingot.gold, ingots });
  usePauseOffscreen(ref);
  const { size } = ingot;

  const later = (fn: () => void, ms: number): void => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = (): void => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  const start = (step: PourStep, queue: PourStep[], delay = 0): void => {
    playId.current += 1;
    if (step.kind === "pour" || step.kind === "add" || step.kind === "fill")
      setStampText(`+${formatCount(step.to - step.from)}`);
    setShown(step.to);
    setPhase("run");
    setPlay({ id: playId.current, step, delay, queue });
  };
  /** Shows the final state of `steps` at once (reduced motion, off screen, skipped). */
  const settle = (steps: readonly PourStep[]): void => {
    const last = steps.at(-1);
    if (last) setShown(last.to);
    writeCount(count?.current, last?.to ?? prev.current.gold);
    if (last) landedRef.current?.(last.to);
    if (steps.some((s) => s.kind === "fill")) fullRef.current?.();
    setPlay(null);
    setPhase("done");
  };

  // Wait for the first time the ingot is on screen, then decide how it arrives.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const track = new IntersectionObserver((entries) => {
      for (const e of entries) onScreen.current = e.isIntersecting;
    });
    track.observe(el);
    const canAnimate =
      ingot.gold > 0 &&
      ingotFill(ingot.gold, size).fraction > 0 &&
      typeof el.animate === "function" &&
      motionOn();
    if (!canAnimate) {
      seen.current = true;
      setPhase("done");
      return () => {
        track.disconnect();
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        seen.current = true;
        const key = pourSeenKey(seenKey);
        if (document.hidden || !motionOn()) {
          setPhase("done");
          return;
        }
        const k: PourKind = readSeen(key) ? "rise" : "pour";
        markSeen(key);
        setKind(k);
        start({ kind: k, from: 0, to: prev.current.gold }, [], POUR.view.delayMs);
      },
      { threshold: POUR.view.threshold },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      track.disconnect();
    };
    // Once per mount: a later progress change is a pour of its own (below), not a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gold arriving (or leaving) after mount.
  useEffect(() => {
    const next = { gold: ingot.gold, ingots };
    const steps = pourSteps(prev.current, next, size);
    prev.current = next;
    if (steps.length === 0) return;
    land.current(); // a pour still running lands first; this one starts from what it left
    clearTimers();
    const el = ref.current;
    if (!seen.current || !onScreen.current || document.hidden || !motionOn() || !el?.animate) {
      if (seen.current) settle(steps);
      else {
        setShown(next.gold); // not shown yet: the first view pours to the new level
        landedRef.current?.(next.gold);
      }
      return;
    }
    const [first, ...rest] = steps;
    if (first) start(first, rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingot.gold, ingots, size]);

  // Run a step's timeline before the frame that shows its end state is painted.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!play || !el) return;
    const { step, delay, queue } = play;
    const fromY = levelY(step.from / size);
    const timeline = pourTimeline({ kind: step.kind, fromY, toY: levelY(step.to / size) }, delay);
    const running: Animation[] = [];
    let fill: Animation | null = null;
    for (const part of timeline) {
      const node =
        part.part === "stamp"
          ? stamp.current
          : el.querySelector(`[data-ingot-part="${part.part}"]`);
      if (!node) continue;
      const a = node.animate(part.keyframes, part.options);
      running.push(a);
      if (part.part === "fill") fill = a;
    }
    // The vault's number and the splash follow the liquid frame by frame (read from the fill's own clock, so a
    // finish() or a seek moves them too).
    const fillTiming = timeline[0]?.options;
    const svg = el.querySelector("svg");
    const streams = step.kind === "pour" || step.kind === "add" || step.kind === "fill";
    if (delay === 0) writeCount(count?.current, step.from);
    let raf = 0;
    let lastSplash = -Infinity;
    // Lands when the liquid reaches its level (the reference: number, message, `busy` off, unlock 250 ms later),
    // while the stream fade and the glint still play on; `done` waits for them. Set from the frame loop (the
    // count's clock) or, without frames (hidden tab), from the fill's own end.
    let landed = false;
    let fullFired = false;
    const fireFull = (): void => {
      if (fullFired) return;
      fullFired = true;
      fullRef.current?.();
    };
    const landNow = (): void => {
      if (landed) return;
      landed = true;
      writeCount(count?.current, step.to);
      landedRef.current?.(step.to);
      if (step.kind === "fill") later(fireFull, VAULT.unlock.delayMs);
      const next = queue[0];
      if (next)
        later(() => {
          start(next, queue.slice(1));
        }, VAULT.unlock.delayMs + VAULT.unlock.holdMs);
    };
    const t0 = performance.now();
    const frame = (): void => {
      // The later of the frame clock and the fill's own: the same in a browser, and a finish() still lands the
      // number at once (a test's paused page clock moves only the frame clock, as for the reference's tween).
      const t =
        Math.max(performance.now() - t0, Number(fill?.currentTime ?? 0)) - (fillTiming?.delay ?? 0);
      if (fill && fillTiming && t >= 0) {
        const k = Math.min(1, t / fillTiming.duration);
        const gold = levelAt(step.from, step.to, k);
        writeCount(count?.current, gold);
        const now = performance.now();
        if (streams && svg && k < POUR.splash.until && now - lastSplash > POUR.splash.everyMs) {
          lastSplash = now;
          const r = svg.getBoundingClientRect();
          const y = streamFoot(levelY(gold / size));
          burst(r.left + (160 / 320) * r.width, r.top + (y / 210) * r.height, {
            type: "spark",
            count: POUR.splash.count,
            speed: POUR.splash.speed,
            angle: -Math.PI / 2,
            spread: POUR.splash.spread,
            life: POUR.splash.life,
          });
        }
        if (k >= 1) {
          if (!over) landNow();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    if (count?.current || streams) raf = requestAnimationFrame(frame);

    const finishAll = (): void => {
      for (const a of running) if (a.playState !== "finished") a.finish();
    };
    // One way out of a step. Naturally: it lands (above), then once every part has played it is `done`, or the
    // next queued step starts after the hold. Skipped (`instant`): everything queued lands now and `onFull` is
    // called at once (a step already landed is not landed again).
    let over = false;
    const end = (instant: boolean): void => {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      if (instant) {
        finishAll();
        clearTimers();
        if (!landed) {
          settle([step, ...queue]);
          return;
        }
        if (step.kind === "fill") fireFull();
        settle(queue);
        return;
      }
      landNow();
      if (queue[0]) return;
      setPlay(null);
      setPhase("done");
    };
    land.current = () => {
      if (playId.current === play.id) end(true);
    };
    const skip = (): void => {
      land.current();
    };
    const onHidden = (): void => {
      if (document.hidden) skip();
    };
    const onReduced = (): void => {
      if (!motionOn()) skip();
    };
    const away = new IntersectionObserver((entries) => {
      if (entries.every((e) => !e.isIntersecting)) skip();
    });
    away.observe(el);
    const system = window.matchMedia("(prefers-reduced-motion: reduce)");
    const toggle = new MutationObserver(onReduced);
    toggle.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduce-motion", "class"],
    });
    system.addEventListener("change", onReduced);
    document.addEventListener("visibilitychange", onHidden);
    el.addEventListener("pointerdown", skip, { passive: true });
    let live = true;
    void fill?.finished.then(
      () => {
        if (live && !over && playId.current === play.id) landNow();
      },
      () => undefined,
    );
    void Promise.allSettled(running.map((a) => a.finished)).then(() => {
      if (live && playId.current === play.id) end(false);
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      away.disconnect();
      toggle.disconnect();
      system.removeEventListener("change", onReduced);
      document.removeEventListener("visibilitychange", onHidden);
      el.removeEventListener("pointerdown", skip);
      for (const a of running) a.cancel();
    };
    // The step is read once at its start; a change mid-pour lands this one first (effect above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  // Unmount (navigation mid-pour): nothing left waiting.
  useEffect(
    () => () => {
      clearTimers();
    },
    [],
  );

  // The reward moment's ingot half: the ring pulse and the coin and spark burst when `unlocked` turns on.
  const wasUnlocked = useRef(unlocked);
  useEffect(() => {
    if (unlocked === wasUnlocked.current) return;
    wasUnlocked.current = unlocked;
    if (!unlocked) return;
    // Reduced motion: no ring pulse (its scale is movement; DESIGN §7.2), the lifted end state just shows.
    if (!reducedMotionNow())
      anim(ring.current, ringKeyframes(), { duration: VAULT.unlock.ring.ms, fill: "none" });
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
    const u = VAULT.unlock;
    burst(cx, cy, {
      type: "coin",
      count: u.coins.count,
      speed: u.coins.speed,
      angle: -Math.PI / 2,
      spread: u.coins.spread,
    });
    burst(cx, cy, { type: "spark", count: u.sparks.count, speed: u.sparks.speed });
  }, [unlocked]);

  // Announce changes after the first render (never on page load: the image's own label says it then).
  const fill = ingotFill(ingot.gold, size);
  const [announce, setAnnounce] = useState("");
  const previous = useRef(fill.label);
  useEffect(() => {
    if (fill.label === previous.current) return;
    previous.current = fill.label;
    setAnnounce(fill.label);
  }, [fill.label]);

  const full = ingotFill(shown, size).fraction >= 1;
  const lifted = unlocked && full;
  return (
    <div
      ref={ref}
      className={cx("ingot-pour m-ingot-box", className)}
      data-ingot-state={phase}
      data-ingot-kind={kind ?? undefined}
      data-lifted={lifted ? "" : undefined}
    >
      <Ingot {...ingot} gold={shown} animated topGold={lifted} className="m-ingot" />
      <span ref={ring} className="m-vring" aria-hidden="true" />
      <span ref={stamp} className="m-stamp" aria-hidden="true">
        {stampText}
      </span>
      <span className="sr-only" aria-live="polite" data-testid="ingot-live">
        {announce}
      </span>
    </div>
  );
}
