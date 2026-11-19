"use client";

import { useState } from "react";
import { IngotPour } from "@/components/motion/IngotPour";
import { buttonClasses } from "@/components/ui/Button";
import { Ingot } from "@/components/ui/Ingot";
import { pourSeenKey } from "@/lib/motion/ingot";
import { Section } from "../Section";

const DEMO_KEY = "dev-motion";

/**
 * `/dev/motion` preview of the ingot pour (P1-08, DESIGN §8.3): pick a level, replay the first-view pour
 * (0.9 s, with the stream) or a later view's rise (0.5 s), and the static states 0 / 50 / 99 / 100.
 */
export function IngotDemo(): React.JSX.Element {
  const [gold, setGold] = useState(720);
  const [run, setRun] = useState(0);
  const replay = (first: boolean): void => {
    try {
      if (first) sessionStorage.removeItem(pourSeenKey(DEMO_KEY));
      else sessionStorage.setItem(pourSeenKey(DEMO_KEY), "1");
    } catch {
      /* storage blocked: every replay is a first view */
    }
    setRun((n) => n + 1);
  };
  return (
    <Section title="Ingot pour">
      <p className="text-small text-ink-2 max-w-prose">
        Pours when it comes into view: 0.9 s with the stream on the first view of a shop in this tab
        session, a 0.5 s rise after that. Tap the ingot to skip; reduced motion shows the final
        state.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-small flex flex-col gap-1 font-semibold">
          Gold (of 1,000)
          <input
            type="range"
            min={0}
            max={1_000}
            step={10}
            value={gold}
            onChange={(e) => {
              setGold(Number(e.target.value));
            }}
            data-testid="ingot-demo-gold"
          />
        </label>
        <button
          type="button"
          className={buttonClasses({ size: 40 })}
          onClick={() => {
            replay(true);
          }}
          data-testid="ingot-demo-pour"
        >
          Replay first view
        </button>
        <button
          type="button"
          className={buttonClasses({ variant: "secondary", size: 40 })}
          onClick={() => {
            replay(false);
          }}
          data-testid="ingot-demo-rise"
        >
          Replay later view
        </button>
      </div>
      <div className="w-full max-w-sm" data-testid="ingot-demo">
        <IngotPour key={run} gold={gold} size={1_000} seenKey={DEMO_KEY} />
      </div>
      <div className="grid max-w-xl grid-cols-4 gap-4">
        {[0, 500, 990, 1_000].map((g) => (
          <Ingot key={g} gold={g} size={1_000} marks={[25, 50, 75]} />
        ))}
      </div>
    </Section>
  );
}
