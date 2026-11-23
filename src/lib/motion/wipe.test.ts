import { afterEach, describe, expect, it } from "vitest";
import {
  WIPE,
  circleClip,
  clearWipe,
  peekWipe,
  remainingDelay,
  riseDelay,
  setWipe,
  setWipeBack,
  takeWipe,
  takeWipeBack,
  wipePoint,
  wipeRadius,
} from "./wipe";

const BASE = "https://moz.test/wallet";

afterEach(() => {
  clearWipe();
});

describe("[PD-08] gold wipe values (reference wallet → shop)", () => {
  it("[PD-08] carries the reference's numbers verbatim", () => {
    expect(WIPE).toMatchObject({
      durationMs: 620,
      easing: "cubic-bezier(0.65,0,0.35,1)",
      shopDelayMs: 110,
      walletScale: 0.92,
      walletOpacity: 0.4,
      walletMs: 600,
      radiusFactor: 1.05,
      sparks: { count: 22, delayMs: 80, speed: [160, 420] },
      rise: { ms: 520, delayMs: 300, staggerMs: 60, fromPx: 22 },
      bar: { ms: 900, delayMs: 420 },
      back: { ms: 520, walletDelayMs: 80 },
      reducedFadeMs: 150,
    });
  });

  it("[PD-08] the radius covers the far corner from any tap point (hypot × 1.05)", () => {
    expect(wipeRadius(390, 844)).toBeCloseTo(Math.hypot(390, 844) * 1.05, 6);
    // From a corner the far corner is exactly hypot away: 1.05 leaves a margin.
    expect(wipeRadius(390, 844)).toBeGreaterThan(Math.hypot(390, 844));
    expect(wipeRadius(0, 0)).toBe(0);
  });

  it("[PD-08] circle clip strings round to 0.1 px", () => {
    expect(circleClip(0, 120, 300)).toBe("circle(0px at 120px 300px)");
    expect(circleClip(970.123, 12.345, 6.78)).toBe("circle(970.1px at 12.3px 6.8px)");
  });

  it("[PD-08] rise delay: 300 ms then 60 ms per element", () => {
    expect([0, 1, 4].map(riseDelay)).toEqual([300, 360, 540]);
  });

  it("[PD-08] a delay already partly spent shrinks, never below 0", () => {
    expect(remainingDelay(110, 0)).toBe(110);
    expect(remainingDelay(110, 40)).toBe(70);
    expect(remainingDelay(110, 500)).toBe(0);
    expect(remainingDelay(110, -5)).toBe(110);
  });
});

describe("[PD-08] tap point", () => {
  const rect = { left: 10, top: 20, width: 300, height: 100 };
  it("[PD-08] a pointer tap uses the pointer, relative to the stage", () => {
    expect(wipePoint({ clientX: 110, clientY: 70 }, rect, { left: 0, top: 0 })).toEqual({
      x: 110,
      y: 70,
    });
    expect(wipePoint({ clientX: 110, clientY: 70 }, rect, { left: 10, top: 5 })).toEqual({
      x: 100,
      y: 65,
    });
  });
  it("[PD-08] a keyboard click (0, 0) or no event uses the card's centre", () => {
    expect(wipePoint({ clientX: 0, clientY: 0 }, rect, { left: 0, top: 0 })).toEqual({
      x: 160,
      y: 70,
    });
    expect(wipePoint(null, rect, { left: 0, top: 0 })).toEqual({ x: 160, y: 70 });
  });
});

describe("[PD-08] wipe handoff (card tap → arriving page)", () => {
  it("[PD-08] the page the tap pointed at takes it once, with the time already spent", () => {
    setWipe("/shops/a", { x: 5, y: 6 }, 1000, BASE);
    expect(peekWipe("/shops/a", 1050)).toEqual({ x: 5, y: 6, elapsed: 50 });
    expect(takeWipe("/shops/a", 1100)).toEqual({ x: 5, y: 6, elapsed: 100 });
    expect(takeWipe("/shops/a", 1100)).toBeNull();
  });
  it("[PD-08] another path, another origin or a stale tap gets nothing (and clears it)", () => {
    setWipe("/shops/a", { x: 1, y: 1 }, 0, BASE);
    expect(takeWipe("/shops/b", 10)).toBeNull();
    expect(peekWipe("/shops/a", 10)).toBeNull();
    setWipe("https://evil.test/shops/a", { x: 1, y: 1 }, 0, BASE);
    expect(takeWipe("/shops/a", 10)).toBeNull();
    setWipe("/shops/a", { x: 1, y: 1 }, 0, BASE);
    expect(takeWipe("/shops/a", WIPE.ttlMs + 1)).toBeNull();
  });
  it("[PD-08] back: the wallet takes a back token once (its elapsed time); an open token isn't a back one, nor the reverse", () => {
    setWipeBack("/wallet", 1000, BASE);
    // The arriving page asks for an open wipe first: that must not throw the back token away.
    expect(takeWipe("/wallet", 1010)).toBeNull();
    expect(takeWipeBack("/wallet", 1020)).toEqual({ elapsed: 20 });
    setWipeBack("/wallet", 1000, BASE);
    expect(takeWipeBack("/shops/a", 1010)).toBeNull();
    setWipeBack("/wallet", 1000, BASE);
    expect(takeWipeBack("/wallet", 1030)).toEqual({ elapsed: 30 });
    expect(takeWipeBack("/wallet", 1030)).toBeNull();
    setWipe("/wallet", { x: 1, y: 1 }, 0, BASE);
    expect(takeWipeBack("/wallet", 10)).toBeNull();
    setWipeBack("/wallet", 0, BASE);
    expect(takeWipeBack("/wallet", WIPE.ttlMs + 1)).toBeNull();
  });
  it("[PD-08] a malformed href records nothing", () => {
    setWipe("http://[bad", { x: 1, y: 1 }, 0, BASE);
    expect(peekWipe("/shops/a", 0)).toBeNull();
  });
});
