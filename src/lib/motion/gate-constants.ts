/**
 * Gilded Gate 2.0's timeline constants (PD-09, DESIGN §8.1), on their own so the landing's client code (the
 * loader and its lazy chunk) can read them without bundling the scene's inline-script sources
 * (`gilded-gate.ts`, rendered on the server only).
 */
export const GATE = {
  id: "gilded-gate",
  /** Beats in ms from the gate's first paint (DESIGN §8.1; the reference intro's `play()`). */
  sparkMs: 520,
  convergeAt: 300,
  igniteAt: 1250,
  /** The ignite burst is skipped when its timer fires later than this past `igniteAt` (a busy main thread). */
  igniteLateMs: 80,
  orbitAt: 1420,
  shineAt: 2350,
  /** The canvas stops drawing here (it has faded out by 1810 ms). */
  canvasUntilMs: 1900,
  forge: {
    at: 1480,
    /** Each letter starts 120 ms + i × stagger after the beat and forges for 760 ms. */
    leadMs: 120,
    staggerMs: 40,
    letterMs: 760,
    /** Long names: the stagger shrinks so the last letter lands by this time (DECISIONS 24 Nov "PD-09"). */
    endCapMs: 3200,
    /** The subtitle follows 200 ms after the last letter's start, for 500 ms. */
    subGapMs: 200,
    subMs: 500,
  },
  shine: { durMs: 1200, staggerMs: 45 },
  /** The gate gives way to the cover once the name has forged, never before this. */
  handoffMinMs: 2400,
  morphMs: 400,
  /** Reduced motion: the gate's end frame only fades away (DESIGN §7). */
  reducedMs: 150,
  riseMs: 200,
  riseStepMs: 40,
  /** The morph takes over the exit only when it is ready this long before the hand-off starts. */
  morphLeadMs: 80,
  /** `arrival` sounds only near the start (and only if audio is already unlocked: `play()` decides). */
  soundBeforeMs: 300,
  /** The coin (the shop's logo in a metal rim): its box is the morph's start. */
  coin: { size: 168, radius: 84 },
} as const;
