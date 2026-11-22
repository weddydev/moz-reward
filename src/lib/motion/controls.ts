/**
 * Molten controls (PD-04; DESIGN §7.4 rows Molten button, Heart toggle, Toast): the reference's values as
 * constants, shared by the components and the spec table (`molten-spec.ts`). No React here.
 */
export const BUTTON = {
  /** Label rolls back to the idle text after (reference `rollLabel` ms = 1700). */
  labelBackMs: 1700,
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

/**
 * Pure: the blob's pour from slot `a` to slot `b` (reference `select()`): stretch, overshoot, settle. `from` is
 * the blob's current computed transform when a pour is interrupted, so it carries on from the shape it is in
 * (the reference restarts from a round blob on the old choice; design review 22 Nov).
 */
export function blobKeyframes(a: Slot, b: Slot, from?: string): Keyframe[] {
  const mid = (a.x + b.x) / 2;
  const dir = b.x > a.x ? 1 : -1;
  return [
    { transform: from ?? `translateX(${String(a.x)}px) scale(1,1)` },
    { transform: `translateX(${String(mid)}px) scale(1.3,.76)`, offset: LIQUID.stretchAt },
    {
      transform: `translateX(${String(b.x + dir * LIQUID.overshootPx)}px) scale(.92,1.1)`,
      offset: LIQUID.overshootAt,
    },
    { transform: `translateX(${String(b.x)}px) scale(1,1)` },
  ];
}

/**
 * Pure: droplet `k`'s arc from slot `a` to slot `b` (the first rises 12 px, the second dips 14 px); `from` is its
 * current computed transform when a pour is interrupted mid-flight.
 */
export function dropKeyframes(a: Slot, b: Slot, k: number, from?: string): Keyframe[] {
  const r = LIQUID.dropSize / 2;
  return [
    { transform: from ?? `translateX(${String(a.c - r)}px) translateY(0) scale(.7)` },
    {
      transform: `translateX(${String((a.c + b.c) / 2 - r)}px) translateY(${k ? "14" : "-12"}px) scale(1)`,
      offset: 0.5,
    },
    { transform: `translateX(${String(b.c - r)}px) translateY(0) scale(.6)` },
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

/** Tabs (PD-06; reference `.seg*`, `.panel` + "tabs"). The pill and its trail are CSS transitions. */
export const TABS = {
  /** The new panel slides in from the side you moved toward. */
  panelMs: 380,
  panelShiftPx: 32,
  /** The panel's number counts up from 0 (cubic out). */
  countUpMs: 650,
} as const;
