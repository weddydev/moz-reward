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
 * - The lazy chunk (`gilded-gate-run.ts`, loaded only when the gate plays) adds the shared-element morph of
 *   the gate into the measured cover and the `arrival` sound, if it arrives in time.
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
 * (a tap ends in one), wheel or any key but a bare modifier; the gate's own animation end also ends it.
 * Clicks, not pointerdown: hiding the gate on touch-down would hand the rest of the tap to the button below.
 */
export function gateScript(code: string): string {
  return `(function(){var g=document.getElementById(${scriptString(GATE.id)}),k=${scriptString(gateStorageKey(code))};if(!g)return;try{if(document.hidden||sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1")}catch(e){return}var T=["click","wheel","keydown"];function end(){g.setAttribute("data-state","done");T.forEach(function(t){removeEventListener(t,skip,true)})}function skip(e){if(e.type==="keydown"&&/^(Shift|Control|Alt|Meta)$/.test(e.key))return;end()}g.setAttribute("data-state","play");T.forEach(function(t){addEventListener(t,skip,{capture:true,passive:true})});g.addEventListener("animationend",function(e){if(e.target===g)end()})})()`;
}

const finite = (b: Box): boolean =>
  [b.left, b.top, b.width, b.height].every(Number.isFinite) && b.width > 0 && b.height > 0;
const px = (n: number): string => `${String(Math.round(n * 1000) / 1000)}px`;

export type GateMorph = {
  scale: number;
  tx: number;
  ty: number;
  /** Clip insets in the cover's own (unscaled) pixels. */
  inset: { x: number; y: number };
  fromRadius: number;
  keyframes: Keyframe[];
};

/**
 * The cover clone starts scaled down (uniformly, so the image never stretches) and clipped to the gate's
 * box and radius, then grows to the cover's box: transform + clip-path only. Null for a box that can't be used.
 */
export function gateMorph(
  gate: Box,
  cover: Box,
  gateRadius: number,
  coverRadius: number,
): GateMorph | null {
  if (!finite(gate) || !finite(cover)) return null;
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
    keyframes: [
      {
        offset: 0,
        opacity: 0,
        transform: `translate(${px(tx)}, ${px(ty)}) scale(${String(Math.round(scale * 1e6) / 1e6)})`,
        clipPath: `inset(${px(y)} ${px(x)} round ${px(fromRadius)})`,
      },
      { offset: 0.3, opacity: 1 },
      {
        offset: 1,
        opacity: 1,
        transform: "none",
        clipPath: `inset(0px round ${px(coverRadius)})`,
      },
    ],
  };
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
