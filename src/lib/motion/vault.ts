/**
 * The Gold Vault's reward moments (PD-10; DESIGN §8.4, §8.6 v2) as data: the reference vault script's values
 * (`design/reference/molten/index.html`, `unlock()` and the Redeem handler), pure so they are tested without a
 * browser and asserted against the reference by `molten-spec.test.ts`. The pour itself is `./ingot.ts`.
 */
export const VAULT = {
  unlock: {
    /** After the pour that reaches the top lands. */
    delayMs: 250,
    ring: { ms: 900, from: 0.4, to: 3.2 },
    /** Light rays fade in behind the vault (a transition) and turn slowly (`spin 40s`). */
    raysMs: 800,
    /** The full ingot lifts (a `--spring` transition). */
    lift: { ms: 700, y: -12, scale: 1.03 },
    topFaceMs: 500,
    leaves: { count: 70, speed: [40, 220] as const, spread: Math.PI * 0.9, gravity: 70 },
    coins: { count: 14, speed: [300, 620] as const, spread: 1.8 },
    sparks: { count: 30, speed: [200, 560] as const },
    card: { ms: 700, delayMs: 350, fromDeg: 80, fromY: 20, overDeg: -8, overAt: 0.7 },
    /**
     * Multi-ingot overflow (not in the reference, which has one ingot): how long the full, lifted ingot shows
     * before the next one starts empty: the ring (900 ms) and the lift (700 ms) play out first.
     */
    holdMs: 1_600,
  },
  redeem: {
    /** The code replaces the button this long after the press (the press's sparks lead). */
    codeDelayMs: 320,
    digitMs: 380,
    staggerMs: 60,
    /** A redeem code lives 15 minutes (PRODUCT §6; the server sets the expiry). */
    validMs: 15 * 60 * 1_000,
    tickMs: 250,
  },
} as const;

const gb = (n: number): string => Math.round(n).toLocaleString("en-GB");

/**
 * The vault's line under the reward: "280 gold to go · about 4 visits", or "Your reward is ready." when full.
 * Gold `owed` from a reversal (P1-12) is paid off before progress counts, so it is still to go.
 */
export function goldToGo(gold: number, size: number, perVisit?: number, owed = 0): string {
  const left = size - gold + Math.max(0, owed);
  if (left <= 0) return "Your reward is ready.";
  if (!perVisit || !(perVisit > 0)) return `${gb(left)} gold to go`;
  const visits = Math.ceil(left / perVisit);
  return `${gb(left)} gold to go · about ${gb(visits)} visit${visits > 1 ? "s" : ""}`;
}

export type Countdown = { leftMs: number; percent: number; label: string; expired: boolean };

/**
 * The redeem countdown at `now` (server time: the phone's clock corrected by `clockSkew`) for a code that
 * expires at `expiresAt` (epoch ms, from the server). The ring is the share of the 15 minutes left; the label
 * is `m:ss`, seconds rounded down like the reference; at zero, expired.
 */
export function countdown(expiresAt: number, now: number): Countdown {
  const leftMs = Math.max(0, Math.min(VAULT.redeem.validMs, expiresAt - now));
  const m = Math.floor(leftMs / 60_000);
  const s = Math.floor(leftMs / 1_000) % 60;
  return {
    leftMs,
    percent: Number(((leftMs / VAULT.redeem.validMs) * 100).toFixed(2)),
    label: `${String(m)}:${String(s).padStart(2, "0")}`,
    expired: leftMs === 0,
  };
}

/**
 * How far the server's clock is from the phone's (ms to add to `Date.now()`), from the server time sent with the
 * code. A phone set wrong then still counts down to the server's expiry. Unreadable → 0.
 */
export const clockSkew = (serverNow: number, clientNow: number): number =>
  Number.isFinite(serverNow) && Number.isFinite(clientNow) ? serverNow - clientNow : 0;

export const ringKeyframes = (): Keyframe[] => [
  { opacity: 1, transform: `scale(${String(VAULT.unlock.ring.from)})` },
  { opacity: 0, transform: `scale(${String(VAULT.unlock.ring.to)})` },
];

export const cardKeyframes = (): Keyframe[] => {
  const c = VAULT.unlock.card;
  return [
    {
      opacity: 0,
      transform: `rotateX(${String(c.fromDeg)}deg) translateY(${String(c.fromY)}px)`,
    },
    { opacity: 1, transform: `rotateX(${String(c.overDeg)}deg)`, offset: c.overAt },
    { opacity: 1, transform: "none" },
  ];
};

export const digitKeyframes = (): Keyframe[] => [
  { opacity: 0, transform: "rotateX(-90deg)" },
  { opacity: 1, transform: "rotateX(0)" },
];
