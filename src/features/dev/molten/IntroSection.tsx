"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GateScene } from "@/components/motion/GateScene";
import { igniteBurst } from "@/components/motion/gilded-gate-run";
import "@/components/motion/gilded-gate.css";
import { buildParticles, particleAt, sampleTargets } from "@/lib/motion/gate-particles";
import {
  GATE,
  gateTimeline,
  gateTitle,
  playGateScene,
  runGateCanvas,
} from "@/lib/motion/gilded-gate";
import { currentTier } from "@/lib/motion/tier";
import { isReducedMotion } from "@/lib/preferences";

const NAME = "Brew & Bloom";
const SUB = "Camden · 720 of 1,000 gold in your vault";
const BEATS = ["Spark", "Converge", "Ignite", "Orbit", "Forge letters", "Shine"] as const;
/** When each beat chip lights (the reference's `beat(i)` timers); −1 = none, at the end. */
const BEAT_AT: readonly (readonly [number, number])[] = [
  [0, 0],
  [GATE.convergeAt, 1],
  [GATE.igniteAt, 2],
  [GATE.orbitAt, 3],
  [GATE.forge.at, 4],
  [GATE.shineAt, 5],
  [3800, -1],
];
const LIB = { runGateCanvas, sampleTargets, buildParticles, particleAt };

/**
 * The reference's intro stage (PD-09; `#intro .stage`): the real gate's scene (`GateScene` + `playGateScene`)
 * in the demo's 580px card with its beat chips, slow-mo and replay. Plays once when a third of it is on screen
 * (after the display font, or 1.2 s), as the reference does; a tap on the stage skips to the rest frame. Parity
 * part `intro`.
 */
export function IntroSection(): React.JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  const run = useRef<{ anims: Animation[]; stop: () => void; timers: number[] } | null>(null);
  const [slow, setSlow] = useState(1);
  const [beat, setBeat] = useState(-1);
  const timeline = gateTimeline(gateTitle(NAME).letters);

  const cancelAll = useCallback(() => {
    const r = run.current;
    run.current = null;
    if (!r) return;
    r.stop();
    r.timers.forEach((t) => {
      window.clearTimeout(t);
    });
    r.anims.forEach((a) => {
      a.cancel();
    });
    setBeat(-1);
  }, []);

  const finish = useCallback(() => {
    cancelAll();
    stage.current?.setAttribute("data-state", "done");
  }, [cancelAll]);

  const play = useCallback(
    (k: number) => {
      const host = stage.current;
      if (!host) return;
      cancelAll();
      if (isReducedMotion()) {
        finish();
        return;
      }
      host.setAttribute("data-state", "play");
      let alive = true;
      const scene = playGateScene(
        host,
        {
          lite: currentTier() === "lite",
          slow: k,
          alive: () => alive,
          staggerMs: timeline.staggerMs,
          subDelayMs: timeline.subDelayMs,
        },
        LIB,
      );
      const timers = BEAT_AT.map(([ms, i]) =>
        window.setTimeout(() => {
          setBeat(i);
        }, ms * k),
      );
      const coin = host.querySelector("[data-gate-frame]");
      timers.push(
        window.setTimeout(() => {
          if (coin) igniteBurst(coin);
        }, GATE.igniteAt * k),
      );
      // The rest frame at 3.8 s, as the reference: finished effects go, the shine (if still running) stays.
      timers.push(
        window.setTimeout(() => {
          host.setAttribute("data-state", "done");
          for (const a of scene.anims) if (a.playState === "finished") a.cancel();
        }, 3800 * k),
      );
      run.current = {
        anims: scene.anims,
        stop: () => {
          alive = false;
          scene.stop();
        },
        timers,
      };
    },
    [cancelAll, finish, timeline.staggerMs, timeline.subDelayMs],
  );

  // First play: when a third of the stage is on screen, after the display font (or 1.2 s), like the reference.
  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    let started = false;
    let io: IntersectionObserver | null = null;
    const start = (): void => {
      io = new IntersectionObserver(
        (es) => {
          for (const en of es) {
            host.classList.toggle("paused", !en.isIntersecting);
            if (en.isIntersecting && !started) {
              started = true;
              play(1);
            }
          }
        },
        { threshold: 0.35 },
      );
      io.observe(host);
    };
    let cancelled = false;
    void Promise.race([
      document.fonts.load("italic 700 40px Fraunces"),
      new Promise((r) => window.setTimeout(r, 1200)),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) start();
      });
    return () => {
      cancelled = true;
      io?.disconnect();
      cancelAll();
    };
    // Mount only: replay and slow-mo restart it themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section data-parity="intro" id="intro" aria-label="Gilded Gate intro">
      {/* Tap anywhere but the buttons to skip to the rest frame. */}
      <div
        ref={stage}
        className="m-stage"
        data-gate-host=""
        data-state="done"
        onPointerDown={(e) => {
          if ((e.target as Element).closest(".m-pill")) return;
          if (stage.current?.getAttribute("data-state") !== "done") finish();
        }}
      >
        {/* The scene sits straight in the stage, as in the reference (curve parity compares document order). */}
        <GateScene name={NAME} sub={SUB} logoUrl="/demo/shops/brew-logo.jpg" />
        <div className="m-stage-cap">
          <span className="m-chip">Gilded Gate 2.0 · 2.4 s · tap to skip</span>
        </div>
        <div className="m-stage-ui">
          <div className="m-beats" aria-hidden="true">
            {BEATS.map((b, i) => (
              <span key={b} className={i === beat ? "m-beat on" : "m-beat"} data-b={i}>
                {b}
              </span>
            ))}
          </div>
          <div className="m-stage-btns">
            <button
              type="button"
              className="m-pill"
              aria-pressed={slow > 1}
              onClick={(e) => {
                e.stopPropagation();
                const k = slow === 1 ? 4 : 1;
                setSlow(k);
                play(k);
              }}
            >
              Slow-mo ¼×
            </button>
            <button
              type="button"
              className="m-pill"
              onClick={(e) => {
                e.stopPropagation();
                play(slow);
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Replay
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
