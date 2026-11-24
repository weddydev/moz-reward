// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GATE } from "@/lib/motion/gate-constants";
import { runGate } from "./gilded-gate-run";

const fx = vi.hoisted(() => ({ burst: vi.fn(() => 0) }));
vi.mock("@/lib/motion/fx", () => ({ burst: fx.burst }));
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));

class FakeCSSAnimation {
  animationName = "gate-life";
  currentTime: number;
  ready: Promise<void>;
  constructor(at: number) {
    this.currentTime = at;
    this.ready = Promise.resolve();
  }
}

/** A playing gate whose life animation reads `clock()` and a coin to burst from. */
function gateAt(clock: { now: number }): HTMLElement {
  const gate = document.createElement("div");
  gate.dataset.state = "play";
  const coin = document.createElement("span");
  coin.setAttribute("data-gate-frame", "");
  gate.append(coin);
  const life = new FakeCSSAnimation(clock.now);
  Object.defineProperty(life, "currentTime", { get: () => clock.now });
  gate.getAnimations = () => [life as unknown as Animation];
  return gate;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("CSSAnimation", FakeCSSAnimation);
  fx.burst.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("[PD-11] runGate's ignite burst (FOLLOWUPS L7)", () => {
  it("[PD-11] fires at 1250 ms on the gate's clock: 22 coins and 46 sparks", async () => {
    const clock = { now: 400 };
    runGate(gateAt(clock));
    await Promise.resolve();
    clock.now = GATE.igniteAt + 10; // the timer fires on time
    vi.advanceTimersByTime(GATE.igniteAt - 400);
    expect(fx.burst).toHaveBeenCalledTimes(2);
  });

  it("[PD-11] a timer that fires well past the moment (a busy main thread) skips the burst", async () => {
    const clock = { now: 400 };
    runGate(gateAt(clock));
    await Promise.resolve();
    clock.now = GATE.igniteAt + GATE.igniteLateMs + 20;
    vi.advanceTimersByTime(GATE.igniteAt - 400);
    expect(fx.burst).not.toHaveBeenCalled();
  });
});
