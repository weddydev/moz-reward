"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCountUp, useMagnetic, usePress } from "@/components/motion/press";
import {
  burst,
  type BurstOptions,
  clearFx,
  type FxStats,
  fxStats,
  setFxSeed,
  setFxTimeScale,
} from "@/lib/motion/fx";
import { celebrate, formatCount } from "@/lib/motion/press";
import { currentTier, deviceTier, setTierOverride, type Tier } from "@/lib/motion/tier";

/** The window hook the E2E and perf specs drive the engine through (this dev page only). */
export type FxTestHook = {
  burst: (x: number, y: number, o?: BurstOptions) => number;
  stats: () => FxStats;
  clear: () => void;
  celebrate: (x: number, y: number) => void;
};
declare global {
  interface Window {
    __mozFx?: FxTestHook;
  }
}

const KINDS: { label: string; o: BurstOptions }[] = [
  { label: "Sparks", o: { type: "spark", count: 28, speed: [180, 520] } },
  {
    label: "Coins",
    o: { type: "coin", count: 12, speed: [260, 520], angle: -Math.PI / 2, spread: 1.6 },
  },
  { label: "Gold leaf", o: { type: "leaf", count: 40, speed: [60, 220], jx: 60 } },
];

const tierListeners = new Set<() => void>();
const subscribeTier = (onChange: () => void): (() => void) => {
  tierListeners.add(onChange);
  return () => {
    tierListeners.delete(onChange);
  };
};
const noSubscription = (): (() => void) => () => undefined;
const readDeviceTier = (): Tier => deviceTier();
function chooseTier(t: Tier | null): void {
  setTierOverride(t);
  tierListeners.forEach((l) => {
    l();
  });
}

const btn =
  "pressable bg-surface border-line text-small rounded-pill hit-44 inline-flex items-center border px-4 py-2 font-semibold";

/**
 * `/dev/motion` FX playground (PD-03): every burst kind, the press kit (press, magnetic lean, ripple,
 * celebrate, count-up), a tier switch (this tab only), slow motion and a fixed seed. Live numbers come from
 * a 250 ms timer, never from rAF, so the "loop sleeps when idle" check sees only the engine.
 */
export function FxPlayground(): React.JSX.Element {
  const [stats, setStats] = useState<FxStats | null>(null);
  // Read from <html> after hydration (the server can't know the device), re-read when the switch changes it.
  const tier = useSyncExternalStore(subscribeTier, currentTier, () => null);
  const device = useSyncExternalStore(noSubscription, readDeviceTier, () => null);
  const [speed, setSpeed] = useState(1);
  const [seed, setSeed] = useState("");
  const [gold, setGold] = useState(80);
  const press = useRef<HTMLButtonElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  usePress(press, { ripple: true, haptic: true });
  useMagnetic(press);
  useCountUp(count, gold);

  useEffect(() => {
    window.__mozFx = {
      burst,
      stats: fxStats,
      clear: clearFx,
      celebrate: (x, y) => {
        celebrate(document.body, { clientX: x, clientY: y });
      },
    };
    const id = window.setInterval(() => {
      setStats(fxStats());
    }, 250);
    return () => {
      window.clearInterval(id);
      delete window.__mozFx;
      setFxTimeScale(1);
      setFxSeed(null);
    };
  }, []);

  const fire = (o: BurstOptions) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    burst(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2, o);
  };

  return (
    <div className="flex flex-col gap-5" data-fx-playground="">
      <div className="flex flex-wrap gap-3">
        {KINDS.map((k) => (
          <button key={k.label} type="button" className={btn} onClick={fire(k.o)}>
            {k.label}
          </button>
        ))}
        <button
          type="button"
          className={btn}
          onClick={() => {
            for (let i = 0; i < 200; i++)
              burst(40 + ((i * 37) % (window.innerWidth - 80)), 120 + ((i * 53) % 320), {
                count: 20,
              });
          }}
        >
          Stress: 200 bursts
        </button>
        <button type="button" className={btn} onClick={clearFx}>
          Clear
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          ref={press}
          type="button"
          data-testid="fx-press"
          className="m-press bg-gold text-ink rounded-pill relative inline-flex h-[54px] items-center overflow-hidden px-7 font-bold"
          onClick={(e) => {
            celebrate(e.currentTarget, e);
            setGold((g) => g + 80);
          }}
        >
          <span className="relative">Collect 80 gold</span>
        </button>
        <p className="text-small text-ink-2">
          Gold:{" "}
          <span ref={count} className="font-semibold tabular-nums" data-testid="fx-count">
            {formatCount(gold)}
          </span>
        </p>
      </div>

      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="text-small mb-2 font-semibold">
          Effects tier (this tab; device: {device ?? "…"})
        </legend>
        {(["full", "lite"] as const).map((t) => (
          <label key={t} className="text-small inline-flex items-center gap-2">
            <input
              type="radio"
              name="fx-tier"
              value={t}
              checked={tier === t}
              onChange={() => {
                chooseTier(t);
              }}
            />
            {t}
          </label>
        ))}
        <button
          type="button"
          className={btn}
          onClick={() => {
            chooseTier(null);
          }}
        >
          Follow the device
        </button>
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-small flex flex-col gap-1">
          Speed
          <select
            className="border-line bg-surface rounded-md border px-3 py-2"
            value={speed}
            onChange={(e) => {
              const k = Number(e.target.value);
              setSpeed(k);
              setFxTimeScale(k);
            }}
          >
            <option value={1}>Real time</option>
            <option value={0.5}>Half speed</option>
            <option value={0.25}>Quarter speed</option>
          </select>
        </label>
        <label className="text-small flex flex-col gap-1">
          Seed (empty = random)
          <input
            className="border-line bg-surface w-32 rounded-md border px-3 py-2"
            inputMode="numeric"
            value={seed}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 9);
              setSeed(v);
              setFxSeed(v === "" ? null : Number(v));
            }}
          />
        </label>
      </div>

      <p className="text-small text-ink-2" data-testid="fx-stats" aria-live="off">
        {stats
          ? `${String(stats.live)} live of ${String(stats.cap)} · loop ${stats.running ? "running" : "asleep"} · ${String(stats.frames)} frames`
          : "Engine starting…"}
      </p>
    </div>
  );
}
