import { describe, expect, it } from "vitest";
import {
  cardKeyframes,
  clockSkew,
  countdown,
  digitKeyframes,
  goldToGo,
  ringKeyframes,
  VAULT,
} from "./vault";

describe("[PD-10] vault copy", () => {
  it("says how much gold is left and about how many visits (the reference's line)", () => {
    expect(goldToGo(720, 1_000, 80)).toBe("280 gold to go · about 4 visits");
    expect(goldToGo(960, 1_000, 80)).toBe("40 gold to go · about 1 visit");
    expect(goldToGo(0, 1_200, 100)).toBe("1,200 gold to go · about 12 visits");
  });

  it("without a per-visit amount: just the gold; full: the reward is ready", () => {
    expect(goldToGo(720, 1_000)).toBe("280 gold to go");
    expect(goldToGo(1_000, 1_000, 80)).toBe("Your reward is ready.");
    expect(goldToGo(1_400, 1_000, 80)).toBe("Your reward is ready.");
  });
});

describe("[PD-10] redeem countdown", () => {
  const issued = Date.UTC(2026, 10, 24, 12, 0, 0);
  const expires = issued + VAULT.redeem.validMs;

  it("is 15 minutes, shown as m:ss with the ring full at the start", () => {
    expect(VAULT.redeem.validMs).toBe(15 * 60 * 1_000);
    expect(countdown(expires, issued)).toEqual({
      leftMs: 900_000,
      percent: 100,
      label: "15:00",
      expired: false,
    });
  });

  it("depletes with time (seconds rounded down, as the reference)", () => {
    const c = countdown(expires, issued + 780);
    expect(c.label).toBe("14:59");
    expect(c.percent).toBeCloseTo(99.91, 2);
    expect(countdown(expires, issued + 14 * 60_000 + 59_001).label).toBe("0:00");
    expect(countdown(expires, issued + 7.5 * 60_000)).toMatchObject({ label: "7:30", percent: 50 });
  });

  it("at zero and after: the expired state, never negative", () => {
    expect(countdown(expires, expires)).toEqual({
      leftMs: 0,
      percent: 0,
      label: "0:00",
      expired: true,
    });
    expect(countdown(expires, expires + 60_000)).toMatchObject({ leftMs: 0, expired: true });
  });

  it("the server's clock decides, not the phone's: a phone 2 minutes fast still shows 15:00", () => {
    const phoneNow = issued + 120_000; // the phone's clock runs 2 min ahead
    const skew = clockSkew(issued, phoneNow);
    expect(skew).toBe(-120_000);
    expect(countdown(expires, phoneNow + skew).label).toBe("15:00");
    // A server time that can't be read (NaN) counts as no skew rather than breaking the countdown.
    expect(clockSkew(Number.NaN, phoneNow)).toBe(0);
  });

  it("an expiry longer than the code's life (bad data) never draws more than a full ring", () => {
    expect(countdown(issued + 2 * VAULT.redeem.validMs, issued).percent).toBe(100);
  });
});

describe("[PD-10] reward and redeem keyframes (reference values)", () => {
  it("ring pulse: .4 → 3.2× while fading, 900 ms", () => {
    expect(ringKeyframes()).toEqual([
      { opacity: 1, transform: "scale(0.4)" },
      { opacity: 0, transform: "scale(3.2)" },
    ]);
    expect(VAULT.unlock.ring.ms).toBe(900);
  });

  it("card flips in from rotateX 80° with a −8° overshoot at 70%, 700 ms after 350 ms", () => {
    expect(cardKeyframes()).toEqual([
      { opacity: 0, transform: "rotateX(80deg) translateY(20px)" },
      { opacity: 1, transform: "rotateX(-8deg)", offset: 0.7 },
      { opacity: 1, transform: "none" },
    ]);
    expect(VAULT.unlock.card).toMatchObject({ ms: 700, delayMs: 350 });
  });

  it("digits flip from rotateX −90°, 380 ms each, 60 ms apart, 320 ms after the press", () => {
    expect(digitKeyframes()).toEqual([
      { opacity: 0, transform: "rotateX(-90deg)" },
      { opacity: 1, transform: "rotateX(0)" },
    ]);
    expect(VAULT.redeem).toMatchObject({ digitMs: 380, staggerMs: 60, codeDelayMs: 320 });
  });

  it("the unlock's bursts are the reference's: 70 leaves, 14 coins, 30 sparks", () => {
    expect(VAULT.unlock.leaves.count).toBe(70);
    expect(VAULT.unlock.coins.count).toBe(14);
    expect(VAULT.unlock.sparks.count).toBe(30);
  });
});
