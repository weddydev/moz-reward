/**
 * Molten controls (PD-04; DESIGN §7.4 rows Molten button, Heart toggle, Toast): the reference's values as
 * constants, shared by the components and the spec table (`molten-spec.ts`). No React here.
 */
export const BUTTON = {
  /** Label rolls back to the idle text after (reference `rollLabel` ms = 1700). */
  labelBackMs: 1700,
  /** The Input tile's sign-in button rolls back later (reference `rollLabel(btn, 2200)`). */
  signInBackMs: 2200,
} as const;

export const HEART = {
  popMs: 620,
  /** Overshoot keyframe offset of the pop (scale 1.3 at .45, .92 at .75). */
  popOvershoot: 0.45,
  ringMs: 600,
  dots: 10,
  dotsMs: 650,
  dotsDelayMs: 60,
  /** Untoggle: a quick settle (scale .85 → 1). */
  offMs: 250,
} as const;

export const TOAST = {
  inMs: 520,
  coinMs: 800,
  /** Visible time and the progress bar (reference: 3600 ms linear). */
  showMs: 3600,
  outMs: 260,
} as const;

/** Fallback spring where CSS `linear()` easing is unsupported (DESIGN §7.1). */
export const SPRING_FALLBACK = "cubic-bezier(.34,1.56,.64,1)";

/** The reference's `SPRING` for Web Animations: the `--spring` token's `linear(…)`, or the fallback. */
export function springEasing(): string {
  if (typeof document === "undefined" || typeof CSS === "undefined") return SPRING_FALLBACK;
  if (!CSS.supports("transition-timing-function", "linear(0, 1)")) return SPRING_FALLBACK;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--spring").trim();
  return v === "" ? SPRING_FALLBACK : v;
}

/** Coin switch (PD-05; DESIGN §7.4; reference `.tgl*` + "coin toggles"). The roll, flip and fill are CSS. */
export const SWITCH = {
  /** Spark burst and gold pulse once the coin lands (turning on only). */
  landMs: 420,
  sparks: 16,
  sparkSpeed: [120, 340] as const,
  pulseMs: 650,
} as const;

/** Liquid choice (PD-05; reference `liquid()` + `#rewardPick`); the dock (PD-07) shares it. */
export const LIQUID = {
  blobMs: 660,
  /** Stretch keyframe (scale 1.3 × .76 halfway across). */
  stretchAt: 0.42,
  /** Overshoot keyframe (4 px past the target, scale .92 × 1.1). */
  overshootAt: 0.76,
  overshootPx: 4,
  dropsMs: 760,
  dropDelayMs: 90,
  dropStaggerMs: 80,
  /** Droplet diameter (`.m-drop`): drops are placed by their centre. */
  dropSize: 26,
  /** Sparks over the chosen option, after the pour. */
  sparkAtMs: 520,
  sparks: 10,
  sparkSpeed: [80, 220] as const,
  easing: "cubic-bezier(.45,0,.2,1)",
  /** The goo filter (`#m-goo`): blur, then an alpha threshold (matrix row `0 0 0 22 -10`). */
  gooBlur: 7,
  gooAlpha: "22 -10",
} as const;

/** Seal checkbox (PD-05; reference `.chk`, `.box` + "checkboxes"). Flood, tick and ring are CSS. */
export const SEAL = {
  boxMs: 480,
  boxEasing: "cubic-bezier(.3,1.4,.5,1)",
  sparkAtMs: 120,
  sparks: 10,
  sparkSpeed: [90, 240] as const,
  sparkLife: [0.35, 0.6] as const,
  /** Unticking: a quick settle (scale .88 → 1). */
  offMs: 220,
} as const;

/** An option's place inside a liquid group: left edge, width and centre, in px from the group's padding box. */
export type Slot = { x: number; w: number; c: number };

/** Which way a liquid group runs: a row (liquid choice, dock) or a column (the desktop rail, PD-07). */
export type LiquidAxis = "x" | "y";

const along = (axis: LiquidAxis, px: number): string =>
  `${axis === "x" ? "translateX" : "translateY"}(${String(px)}px)`;
/** `scale(sx, sy)` with the two factors swapped for a column, so a column stretches along its own run. */
const stretch = (axis: LiquidAxis, run: string, cross: string): string =>
  axis === "x" ? `scale(${run},${cross})` : `scale(${cross},${run})`;

/**
 * Pure: the blob's pour from slot `a` to slot `b` (reference `select()`): stretch, overshoot, settle. `from` is
 * the blob's current computed transform when a pour is interrupted, so it carries on from the shape it is in
 * (the reference restarts from a round blob on the old choice; design review 22 Nov). A column (`axis` "y")
 * pours the same way turned 90°: slots are then top, height and middle.
 */
export function blobKeyframes(a: Slot, b: Slot, from?: string, axis: LiquidAxis = "x"): Keyframe[] {
  const mid = (a.x + b.x) / 2;
  const dir = b.x > a.x ? 1 : -1;
  return [
    { transform: from ?? `${along(axis, a.x)} ${stretch(axis, "1", "1")}` },
    { transform: `${along(axis, mid)} ${stretch(axis, "1.3", ".76")}`, offset: LIQUID.stretchAt },
    {
      transform: `${along(axis, b.x + dir * LIQUID.overshootPx)} ${stretch(axis, ".92", "1.1")}`,
      offset: LIQUID.overshootAt,
    },
    { transform: `${along(axis, b.x)} ${stretch(axis, "1", "1")}` },
  ];
}

/**
 * Pure: droplet `k`'s arc from slot `a` to slot `b` (the first rises 12 px, the second dips 14 px); `from` is its
 * current computed transform when a pour is interrupted mid-flight. In a column the arc bows sideways.
 */
export function dropKeyframes(
  a: Slot,
  b: Slot,
  k: number,
  from?: string,
  axis: LiquidAxis = "x",
): Keyframe[] {
  const r = LIQUID.dropSize / 2;
  const bow = `${axis === "x" ? "translateY" : "translateX"}(${k ? "14" : "-12"}px)`;
  const rest = axis === "x" ? "translateY(0)" : "translateX(0)";
  return [
    { transform: from ?? `${along(axis, a.c - r)} ${rest} scale(.7)` },
    { transform: `${along(axis, (a.c + b.c) / 2 - r)} ${bow} scale(1)`, offset: 0.5 },
    { transform: `${along(axis, b.c - r)} ${rest} scale(.6)` },
  ];
}

/** Pure: the next enabled option from `from` in direction `dir` (wrapping), or `from` if none is enabled. */
export function nextEnabled(disabled: readonly boolean[], from: number, dir: 1 | -1): number {
  const n = disabled.length;
  for (let step = 1; step <= n; step++) {
    const j = (((from + dir * step) % n) + n) % n;
    if (!disabled[j]) return j;
  }
  return from;
}

/**
 * Floating dock (PD-07; reference `.dock`, `.dk`, `.scan` + "phone"). The indicator is the liquid choice's pour
 * (`LIQUID`); the icon lift, the Scan halo and radar loops are CSS.
 */
export const DOCK = {
  /** Scan press (reference `#scanBtn` click): scale 1 → .86 (30%) → 1.08 (70%) → 1. */
  scanPressMs: 500,
  scanPressKeyframes: [
    { transform: "scale(1)" },
    { transform: "scale(.86)", offset: 0.3 },
    { transform: "scale(1.08)", offset: 0.7 },
    { transform: "scale(1)" },
  ] satisfies Keyframe[],
  scanSparks: 26,
  scanSparkSpeed: [160, 400] as const,
  /** The on-screen keyboard counts as open when the visual viewport is at least this much shorter. */
  keyboardMinPx: 150,
} as const;

/**
 * Pure: is the on-screen keyboard open? Browsers keep the layout viewport and shrink the visual one when it
 * opens (iOS Safari; Android Chrome since 108), so a big gap while an editable element has focus means a
 * keyboard. A gap with no editable focus is pinch zoom; a small gap is the iOS toolbar.
 */
export function keyboardOpen(
  layoutHeight: number,
  visualHeight: number,
  editing: boolean,
): boolean {
  return editing && layoutHeight - visualHeight >= DOCK.keyboardMinPx;
}

/** Tabs (PD-06; reference `.seg*`, `.panel` + "tabs"). The pill and its trail are CSS transitions. */
export const TABS = {
  /** The gold pill glides to the chosen tab on the spring; the faint trail behind it takes longer. Web Animations,
   * not the reference's CSS transition (PD-11: WebKit left a retargeted transition stuck at its start). */
  pillMs: 600,
  trailMs: 950,
  /** The new panel slides in from the side you moved toward. */
  panelMs: 380,
  panelShiftPx: 32,
  /** The panel's number counts up from 0 (cubic out). */
  countUpMs: 650,
} as const;

/** Text field (PD-06; reference `.field`, `.beam`, `.okmark` + "input"). The beam, label and tick are CSS. */
export const FIELD = {
  /** A new error shakes the field (−10, 9, −6, 3 px, ease-out). */
  shakeMs: 420,
  shakePx: [0, -10, 9, -6, 3, 0] as const,
} as const;

/** Star rating (PD-06; reference `.stars`, `.star`, `.rate-*` + "stars"). The two choices' pop is CSS. */
export const STARS = {
  /** Each chosen star pops (.6 → 1.3 at half → 1, rotating −20° → 8° → 0). */
  popMs: 480,
  popEasing: "cubic-bezier(.3,1.4,.5,1)",
  /** One star after another. */
  staggerMs: 70,
  sparks: 7,
  sparkSpeed: [80, 200] as const,
  sparkLife: [0.3, 0.55] as const,
  /** The rating's word rises in after the last star (delay = rating × stagger). */
  labelMs: 300,
  /** What each rating says (0 = none yet). */
  words: ["Tap a star", "Poor", "Fair", "Good", "Great", "Outstanding"] as const,
} as const;

/**
 * Molten slider (PD-06; reference `.slider`, `.sl-*`, `.bubble`, `.ticks` + "slider"). The fill, thumb and the
 * bubble's spring back are CSS; the tilt and the notch sparks follow each input.
 */
export const SLIDER = {
  /** The bubble leans at most this far either way. */
  tiltMaxDeg: 28,
  /**
   * Lean per unit of speed: the reference's `-vel * 60`, with `vel` in gold per ms on its 0–720 range. Here the
   * speed is in fractions of the range per ms, so any range leans the same for the same thumb speed.
   */
  tiltPerSpeed: 60 * 720,
  /** Gaps between inputs shorter than this count as this (reference `Math.max(16, …)`). */
  minDtMs: 16,
  /** No input for this long and the bubble springs back upright (reference `setTimeout(…, 90)`). */
  settleMs: 90,
  /** The spring back (`.m-bubble` transition). */
  springMs: 500,
  /** Sparks when the thumb crosses a notch. */
  sparks: 12,
  sparkSpeed: [100, 260] as const,
  /** The coin thumb's diameter (px): it travels the track's width less this. */
  thumbPx: 36,
} as const;

/**
 * Pure: the value a native range input shows for `v` (HTML's value sanitisation): clamped to [min, max], on the
 * nearest step counted from `min` (a tie rounds up), never past the last step at or below `max`; not a number →
 * the middle of the range. `step` ≤ 0 means no stepping; `max` below `min` holds `min`.
 */
export function sliderValue(v: number, min: number, max: number, step: number): number {
  if (max < min) return min;
  const raw = Number.isFinite(v) ? v : min + (max - min) / 2;
  const clamped = Math.min(max, Math.max(min, raw));
  if (!(step > 0)) return clamped;
  // Steps as integers from min, so 0.1 steps don't drift (0.30000000000000004).
  const last = Math.floor((max - min) / step + 1e-9);
  const n = Math.min(last, Math.floor((clamped - min) / step + 0.5 + 1e-9));
  const decimals = Math.max(decimalsOf(step), decimalsOf(min));
  return Number((min + n * step).toFixed(decimals));
}

const decimalsOf = (n: number): number => {
  const s = String(n);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
};

/** Pure: where `v` sits along [min, max], 0–1 (0 for an empty range). */
export function sliderFraction(v: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}

/**
 * Pure: the bubble's lean in degrees for a move of `dFraction` of the range in `dtMs` (reference: `clamp(-28, 28,
 * -vel * 60)`): it leans back against the movement, harder the faster, never past ±28°.
 */
export function sliderTilt(dFraction: number, dtMs: number): number {
  const speed = dFraction / Math.max(SLIDER.minDtMs, dtMs);
  const tilt = Math.min(
    SLIDER.tiltMaxDeg,
    Math.max(-SLIDER.tiltMaxDeg, -speed * SLIDER.tiltPerSpeed),
  );
  return tilt === 0 ? 0 : tilt;
}

/**
 * Pure: the notches a move from `prev` to `next` crosses going up (reference: `lastV < m && v >= m`), in value
 * order, each once. Moving down, staying put or resting on a notch crosses none; a notch at the range's start
 * can never be crossed.
 */
export function crossedNotches(prev: number, next: number, notches: readonly number[]): number[] {
  return notches.filter((m) => prev < m && next >= m).sort((a, b) => a - b);
}

/**
 * Molten member card (PD-06; DESIGN §6, §6.3, §7.4; reference `.mcard`, `.mface`, `.holo`, `.glare` + "member
 * card"). The tilt, spring back, flip and idle sway are CSS; the pointer only sets where the card leans and where
 * the foil and glare sit (once per frame).
 */
export const MEMBER_CARD = {
  /** Tilt across the card's height: `(.5 - py) * 22`, so ±11° about the x axis. */
  tiltXDeg: 22,
  /** Tilt across its width: `(px - .5) * 26`, so ±13° about the y axis. */
  tiltYDeg: 26,
  /** Tracking the pointer (`.m-mcard.live` transition, linear). */
  trackMs: 120,
  /** Spring back upright, and the flip (`.m-mcard` transition, `--spring`). */
  springMs: 700,
  /** Idle sway on touch-only screens (`.m-mcard.idle`, alternate). */
  swayMs: 7000,
  /** The foil gradient is this many times the face (reference `background-size: 260%`). */
  holoSize: 2.6,
  /** The decorative QR placeholder: cells per side and the reference's seed. */
  qrCells: 25,
  qrSeed: 42,
} as const;

const unit = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/**
 * Pure: where a pointer sits on the card, 0–1 across and down (reference `clamp(0, 1, (x - left) / width)`),
 * clamped to the card; a card with no size (not laid out yet) or a pointer with no position reads as its centre.
 */
export function cardPointer(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { px: number; py: number } {
  return {
    px: rect.width > 0 ? unit((clientX - rect.left) / rect.width) : 0.5,
    py: rect.height > 0 ? unit((clientY - rect.top) / rect.height) : 0.5,
  };
}

/**
 * Pure: the card's lean (degrees) for a pointer at (`px`, `py`): the top comes towards a pointer above the middle
 * (+x rotation) and the right side towards a pointer right of it; ±11° / ±13° at the edges, 0 at the centre.
 */
export function cardTilt(px: number, py: number): { rx: number; ry: number } {
  const rx = (0.5 - unit(py)) * MEMBER_CARD.tiltXDeg;
  const ry = (unit(px) - 0.5) * MEMBER_CARD.tiltYDeg;
  // No −0 (a CSS value written as "-0.00deg").
  return { rx: rx === 0 ? 0 : rx, ry: ry === 0 ? 0 : ry };
}

/**
 * Pure: the foil's offset as a fraction of its own size, the same picture as the reference's `background-size:
 * 260%` at `background-position: px py`, but moved with a transform (composite only): the 2.6× layer slides left
 * by (2.6 − 1) × px of the face, i.e. 1.6/2.6 × px of itself.
 */
export function holoShift(px: number, py: number): { x: number; y: number } {
  const k = (MEMBER_CARD.holoSize - 1) / MEMBER_CARD.holoSize;
  const x = -k * unit(px);
  const y = -k * unit(py);
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}

/**
 * Pure: the glare for a pointer at (`px`, `py`) on a `w` × `h` face (px), as a transform of one square light whose
 * radius at scale 1 is half the face's diagonal. The reference draws `radial-gradient(circle at gx gy, …)`, whose
 * ray reaches the farthest corner, so the light grows towards the edges: `scale` is that ray over the half
 * diagonal (1 at the centre, 2 in a corner). On the back face (`flipped`) the card is turned over, so the light
 * sits mirrored across (reference `flipped ? 1 - px : px`). `x`/`y` place the square's top-left corner.
 */
export function cardGlare(
  px: number,
  py: number,
  w: number,
  h: number,
  flipped: boolean,
): { x: number; y: number; size: number; scale: number } {
  const gx = flipped ? 1 - unit(px) : unit(px);
  const gy = unit(py);
  const half = Math.hypot(w / 2, h / 2);
  if (!(half > 0)) return { x: 0, y: 0, size: 0, scale: 1 };
  const ray = Math.hypot(Math.max(gx, 1 - gx) * w, Math.max(gy, 1 - gy) * h);
  return { x: gx * w - half, y: gy * h - half, size: 2 * half, scale: ray / half };
}

/**
 * Pure: what the member card does on this device. Reduced motion: nothing follows the pointer and nothing sways
 * (the flip still turns over, instantly: no transform transition runs under reduced motion). A fine pointer
 * (mouse, trackpad) never sways: the card waits for the pointer. A touch-only screen, iOS included, tilts from the
 * finger and sways when untouched, like the reference. DESIGN §6 gates only a device-orientation (gyroscope) tilt
 * behind iOS's permission; the card has none (DECISIONS 23 Nov).
 */
export function memberCardMotion(env: { reduced: boolean; fine: boolean }): {
  follow: boolean;
  tilt: boolean;
  sway: boolean;
} {
  const follow = !env.reduced;
  return { follow, tilt: follow, sway: follow && !env.fine };
}

/**
 * Pure: the decorative QR-style pattern of the card's back (the reference's: a Lehmer generator from seed 42,
 * cells above .52 drawn, three finder squares), row by row. Not a code: P1-14 puts the real one there.
 */
export function qrPlaceholderCells(
  size: number = MEMBER_CARD.qrCells,
  seed: number = MEMBER_CARD.qrSeed,
): boolean[][] {
  let s = seed;
  const rand = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  // Row by row, left to right: the reference's draw order, so the same cells come out.
  const cells = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rand() > 0.52),
  );
  const finder = (fx: number, fy: number): void => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const ring = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        const row = cells[fy + y];
        if (row && fx + x < size) row[fx + x] = ring || core;
      }
  };
  for (const [fx, fy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ] as const)
    finder(fx, fy);
  return cells;
}
