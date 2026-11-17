import type { Box } from "./presets";

/**
 * Gilded Gate, the first-scan entry on `/s/[code]?src=qr|nfc` (P1-03, DESIGN §8.1). Pure parts: the
 * timeline, the per-shop session key, the pre-paint script and the gate → cover morph geometry.
 *
 * How the pieces fit (DECISIONS 17 Nov "Gilded Gate: CSS timeline from first paint, lazy JS morph"):
 * - The page renders the gate markup only for `src=qr|nfc` (`GildedGate.tsx`). It is hidden by default;
 *   `gateScript` runs right after it, before first paint, and sets `data-state="play"` unless this shop's gate
 *   already played in this browser session (or storage is blocked, or the tab is in the background). No
 *   JavaScript → no gate, never a stuck cover.
 * - Steps 1–3 and a plain step-4 exit are CSS keyframes (`gilded-gate.css`): they start at first paint and run
 *   on the compositor while the page hydrates. Taps, wheel and keys skip from the first frame (the script).
 * - Step 4's shared-element morph (`runGateMorph`) is a second inline script right after the landing markup:
 *   it runs during parse, so it is in time even on a slow phone. The lazy chunk (`gilded-gate-run.ts`, loaded
 *   only when the gate plays) plays `arrival` if audio is already unlocked.
 * - Client-side renders (back navigation within the app) never run the inline script, so the gate never
 *   replays there; a reload or a fresh load reads the session key.
 */
export const GATE = {
  id: "gilded-gate",
  totalMs: 1400,
  drawEndMs: 200,
  logoEndMs: 700,
  shimmerEndMs: 1000,
  morphMs: 400,
  /** Reduced motion: the gate only fades away (DESIGN §7). */
  reducedMs: 150,
  riseMs: 200,
  riseStepMs: 40,
  /** The chunk takes over step 4 only when it is ready this long before step 4 starts. */
  morphLeadMs: 80,
  /** `arrival` sounds only near the start (and only if audio is already unlocked: `play()` decides). */
  soundBeforeMs: 300,
  frame: { width: 168, height: 208, radius: 28, stroke: 1.5 },
} as const;

export type GateSource = "qr" | "nfc";

/** The entry source that plays the gate: exactly `qr` or `nfc` (print kits and NFC tags use lowercase). */
export function gateEntrySource(src: string | string[] | undefined): GateSource | null {
  return src === "qr" || src === "nfc" ? src : null;
}

export const gateStorageKey = (code: string): string => `moz.gate.${code}`;

/** JSON string literal that is also safe inside `<script>` (no `</script>` or `<!--`). */
const scriptString = (value: string): string => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * The inline pre-paint script (nonce'd by the page). Plays at most once per shop per session; skip = click
 * (a tap ends in one), a scroll of the page (a swipe on the gate scrolls it; inner scrollers don't count), wheel,
 * or any key but a bare
 * modifier; the gate's own animation end also ends it, and stops the morph (the hidden gate hides its copy).
 * Clicks, not pointerdown: hiding the gate on touch-down would hand the rest of the tap to the button below.
 */
export function gateScript(code: string): string {
  return `(function(){var g=document.getElementById(${scriptString(GATE.id)}),k=${scriptString(gateStorageKey(code))};if(!g)return;try{if(document.hidden||sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1")}catch(e){return}var T=["click","wheel","scroll","keydown"];function end(){g.setAttribute("data-state","done");var p=g.querySelector("[data-gate-panel]");if(p&&p.getAnimations)p.getAnimations({subtree:true}).forEach(function(a){a.cancel()});T.forEach(function(t){removeEventListener(t,skip,true)})}function skip(e){if(e.type==="keydown"&&/^(Shift|Control|Alt|Meta)$/.test(e.key))return;if(e.type==="scroll"&&e.target!==document)return;end()}g.setAttribute("data-state","play");T.forEach(function(t){addEventListener(t,skip,{capture:true,passive:true})});g.addEventListener("animationend",function(e){if(e.target===g)end()})})()`;
}

export type GateMorph = {
  scale: number;
  tx: number;
  ty: number;
  /** Clip insets in the cover's own (unscaled) pixels. */
  inset: { x: number; y: number };
  fromRadius: number;
  /** Outer element: opacity + transform (compositor-friendly on its own). */
  move: Keyframe[];
  /** Inner element: clip-path, kept off the transform's element so the transform can stay on the compositor. */
  clip: Keyframe[];
};

/**
 * The cover clone starts scaled down (uniformly, so the image never stretches) and clipped to the gate's
 * box and radius, then grows to the cover's box. Null for a box that can't be used.
 *
 * Self-contained on purpose (no outside helpers or imports): `gateMorphScript` inlines its source.
 */
export function gateMorph(
  gate: Box,
  cover: Box,
  gateRadius: number,
  coverRadius: number,
): GateMorph | null {
  const usable = (b: Box): boolean =>
    [b.left, b.top, b.width, b.height].every(Number.isFinite) && b.width > 0 && b.height > 0;
  const px = (n: number): string => `${String(Math.round(n * 1000) / 1000)}px`;
  if (!usable(gate) || !usable(cover)) return null;
  const scale = Math.max(gate.width / cover.width, gate.height / cover.height);
  const x = (cover.width - gate.width / scale) / 2;
  const y = (cover.height - gate.height / scale) / 2;
  const tx = gate.left - cover.left - x * scale;
  const ty = gate.top - cover.top - y * scale;
  const fromRadius = gateRadius / scale;
  return {
    scale,
    tx,
    ty,
    inset: { x, y },
    fromRadius,
    move: [
      {
        offset: 0,
        opacity: 0,
        transform: `translate(${px(tx)}, ${px(ty)}) scale(${String(Math.round(scale * 1e6) / 1e6)})`,
      },
      { offset: 0.3, opacity: 1 },
      { offset: 1, opacity: 1, transform: "none" },
    ],
    clip: [
      { offset: 0, clipPath: `inset(${px(y)} ${px(x)} round ${px(fromRadius)})` },
      { offset: 1, clipPath: `inset(0px round ${px(coverRadius)})` },
    ],
  };
}

export type MorphConfig = {
  id: string;
  radius: number;
  morphMs: number;
  delayMs: number;
  leadMs: number;
  ease: string;
};

/**
 * Step 4's shared-element morph, run by an inline script right after the landing markup (so during parse,
 * before any framework JS: on a slow phone it is still ready long before 1000ms). A clone of the page's cover
 * grows out of the gate's box into the cover's box, timed against the CSS timeline's own start (and held with
 * it if something pauses it). Skipped under reduced motion (the CSS then runs `gate-fade`, not `gate-life`).
 * The real cover hides while it runs (`data-morph`), so only one cover is ever on screen. The copy is the
 * gate's server-rendered `[data-gate-panel]`: this only sizes and animates it, so hydration sees the server's DOM.
 *
 * Self-contained on purpose: `gateMorphScript` inlines its source with `gateMorph` passed in.
 */
export function runGateMorph(cfg: MorphConfig, morph: typeof gateMorph): void {
  const gate = document.getElementById(cfg.id);
  if (!gate || gate.getAttribute("data-state") !== "play") return;
  const life = gate
    .getAnimations()
    .filter((a) => (a as CSSAnimation).animationName === "gate-life")[0];
  if (!life) return;
  life.ready
    .then(() => {
      const elapsed = life.currentTime;
      if (gate.getAttribute("data-state") !== "play" || typeof elapsed !== "number") return;
      if (elapsed > cfg.delayMs - cfg.leadMs) return; // step 4 has begun: leave the CSS exit alone
      const cover = document.querySelector<HTMLElement>("[data-gate-cover]");
      const frame = gate.querySelector<HTMLElement>("[data-gate-frame]");
      const panel = gate.querySelector<HTMLElement>("[data-gate-panel]");
      const art = panel?.firstElementChild as HTMLElement | null | undefined;
      if (!cover || !frame || !panel || !art) return;
      const c = cover.getBoundingClientRect();
      const m = morph(
        frame.getBoundingClientRect(),
        c,
        cfg.radius,
        Number.parseFloat(getComputedStyle(cover).borderTopLeftRadius) || 0,
      );
      if (!m) return;
      // Styles and animations only: the panel and its cover copy are server-rendered (no DOM changes before
      // React hydrates).
      Object.assign(panel.style, {
        left: `${String(c.left)}px`,
        top: `${String(c.top)}px`,
        width: `${String(c.width)}px`,
        height: `${String(c.height)}px`,
      });
      gate.setAttribute("data-morph", "");
      const ease =
        getComputedStyle(document.documentElement).getPropertyValue("--ease-in-out").trim() ||
        cfg.ease;
      const timing: KeyframeAnimationOptions = {
        duration: cfg.morphMs,
        delay: cfg.delayMs,
        easing: ease,
        fill: "both",
      };
      for (const a of [panel.animate(m.move, timing), art.animate(m.clip, timing)]) {
        if (life.playState === "running" && typeof life.startTime === "number") {
          a.startTime = life.startTime;
        } else {
          a.pause();
          a.currentTime = elapsed;
        }
      }
    })
    .catch(() => undefined); // cancelled by a skip
}

/** The inline morph script (nonce'd; rendered after the landing content, only with the gate). */
export function gateMorphScript(): string {
  const cfg: MorphConfig = {
    id: GATE.id,
    radius: GATE.frame.radius,
    morphMs: GATE.morphMs,
    delayMs: GATE.shimmerEndMs,
    leadMs: GATE.morphLeadMs,
    ease: "cubic-bezier(.65,0,.35,1)",
  };
  return `(${runGateMorph.toString()})(${JSON.stringify(cfg).replace(/</g, "\\u003c")},(${gateMorph.toString()}))`;
}

/** The outline as two halves drawn together from the top centre down to the bottom centre. */
export function gateOutlinePaths(w: number, h: number, r: number, i: number): [string, string] {
  const c = w / 2;
  const a = r - i;
  return [
    `M${c} ${i} H${r} A${a} ${a} 0 0 0 ${i} ${r} V${h - r} A${a} ${a} 0 0 0 ${r} ${h - i} H${c}`,
    `M${c} ${i} H${w - r} A${a} ${a} 0 0 1 ${w - i} ${r} V${h - r} A${a} ${a} 0 0 1 ${w - r} ${h - i} H${c}`,
  ];
}
