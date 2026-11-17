import { GATE } from "@/lib/motion/gilded-gate";
import { play } from "@/lib/sound";

/**
 * The Gilded Gate's lazy chunk (P1-03): the `arrival` sound, near the start only, and only if audio is already
 * unlocked (`play()` stays silent otherwise; on a first load it never is, DESIGN §9 "never force"). Sound is not
 * motion, so it plays under reduced motion too (`gate-fade`). The morph itself is an inline script
 * (`runGateMorph`): it must not wait for this chunk.
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
      if (gate.dataset.state === "play" && typeof elapsed === "number") {
        if (elapsed < GATE.soundBeforeMs) play("arrival");
      }
    })
    .catch(() => undefined); // cancelled by a skip
}
