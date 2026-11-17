import { GATE, gateMorph } from "@/lib/motion/gilded-gate";
import { isReducedMotion } from "@/lib/preferences";
import { play } from "@/lib/sound";

/**
 * The Gilded Gate's lazy chunk (P1-03): step 4's shared-element morph (a clone of the page's cover grows
 * from the gate's box into the cover's box) and the `arrival` sound. Everything is timed against the CSS
 * timeline's own start, so a chunk that arrives late joins in step rather than restarting anything; one that
 * arrives after step 4 has begun leaves the CSS exit alone. Skip = the gate is hidden, which hides the clone.
 */
export function runGate(gate: HTMLElement): void {
  const life = gate
    .getAnimations()
    .find((a) => a instanceof CSSAnimation && a.animationName === "gate-life");
  if (!life || gate.dataset.state !== "play") return;
  life.ready
    .then(() => {
      start(gate, life);
    })
    .catch(() => undefined); // cancelled by a skip
}

function start(gate: HTMLElement, life: Animation): void {
  const elapsed = life.currentTime;
  if (gate.dataset.state !== "play" || typeof elapsed !== "number") return;
  if (elapsed < GATE.soundBeforeMs) play("arrival"); // silent unless audio is already unlocked
  if (isReducedMotion() || elapsed > GATE.shimmerEndMs - GATE.morphLeadMs) return;

  const cover = document.querySelector<HTMLElement>("[data-gate-cover]");
  const frame = gate.querySelector<HTMLElement>("[data-gate-frame]");
  const bg = gate.querySelector(".gate-bg");
  if (!cover || !frame || !bg) return;
  const c = cover.getBoundingClientRect();
  const morph = gateMorph(
    frame.getBoundingClientRect(),
    c,
    GATE.frame.radius,
    Number.parseFloat(getComputedStyle(cover).borderTopLeftRadius) || 0,
  );
  if (!morph) return;

  const panel = cover.cloneNode(true) as HTMLElement;
  for (const el of [panel, ...panel.querySelectorAll("*")]) {
    el.removeAttribute("id");
    el.removeAttribute("data-testid");
    el.removeAttribute("data-gate-cover");
  }
  panel.dataset.gatePanel = "";
  Object.assign(panel.style, {
    position: "fixed",
    left: `${String(c.left)}px`,
    top: `${String(c.top)}px`,
    width: `${String(c.width)}px`,
    height: `${String(c.height)}px`,
    margin: "0",
    opacity: "0",
    transformOrigin: "0 0",
  });
  bg.after(panel);
  gate.dataset.morph = ""; // hides the real cover until the gate ends (gilded-gate.css)
  const morphing = panel.animate(morph.keyframes, {
    duration: GATE.morphMs,
    delay: GATE.shimmerEndMs,
    easing: "cubic-bezier(.65,0,.35,1)", // --ease-in-out: a move
    fill: "both",
  });
  // In step with the CSS timeline: same start while it runs; held at the same moment if something paused it.
  if (life.playState === "running" && typeof life.startTime === "number") {
    morphing.startTime = life.startTime;
  } else {
    morphing.pause();
    morphing.currentTime = elapsed;
  }
}
