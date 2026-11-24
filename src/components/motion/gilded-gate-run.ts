import { burst } from "@/lib/motion/fx";
import { GATE } from "@/lib/motion/gate-constants";
import { play } from "@/lib/sound";

/** The ignite burst (DESIGN §8.1 step 3): 22 coins up and 46 sparks from the coin's centre. */
export function igniteBurst(coin: Element): void {
  const r = coin.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  burst(x, y, { type: "coin", count: 22, speed: [380, 760], angle: -Math.PI / 2, spread: 2.6 });
  burst(x, y, { type: "spark", count: 46, speed: [260, 720] });
}

/**
 * The Gilded Gate's lazy chunk (P1-03, PD-09), loaded after hydration only when the gate plays:
 * - the `arrival` sound, near the start only, and only if audio is already unlocked (`play()` stays silent
 *   otherwise; on a first load it never is, DESIGN §9 "never force"). Sound is not motion, so it plays under
 *   reduced motion too (`gate-fade`);
 * - the ignite burst through the shared FX engine, at 1250 ms on the gate's own clock, if the chunk is here in
 *   time (it is decoration: a late chunk skips it, the scene itself never waits for it). The FX engine draws
 *   nothing under reduced motion.
 * The scene and the morph are inline scripts: they must not wait for this chunk.
 */
export function runGate(gate: HTMLElement): void {
  const life = gate
    .getAnimations()
    .find(
      (a) =>
        a instanceof CSSAnimation &&
        (a.animationName === "gate-life" || a.animationName === "gate-fade"),
    );
  if (!life) return;
  life.ready
    .then(() => {
      const elapsed = life.currentTime;
      if (gate.dataset.state !== "play" || typeof elapsed !== "number") return;
      if (elapsed < GATE.soundBeforeMs) play("arrival");
      const wait = GATE.igniteAt - elapsed;
      const coin = gate.querySelector("[data-gate-frame]");
      if (wait < 0 || !coin || (life as CSSAnimation).animationName !== "gate-life") return;
      window.setTimeout(() => {
        if (gate.dataset.state === "play") igniteBurst(coin);
      }, wait);
    })
    .catch(() => undefined); // cancelled by a skip
}
