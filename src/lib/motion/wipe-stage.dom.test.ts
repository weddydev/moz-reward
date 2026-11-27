// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const burst = vi.fn<(...a: unknown[]) => void>();
vi.mock("./fx", () => ({
  burst: (...a: unknown[]) => {
    burst(...a);
  },
}));
vi.mock("./anim", () => ({ anim: () => null, reducedMotionNow: () => false }));

const { registerWipeStage, settleWipe, startWipe } = await import("./wipe-stage");
const { WIPE } = await import("./wipe");

function mount(): HTMLElement {
  document.body.innerHTML =
    '<main id="main"><div data-route-content><a id="card" href="/shops/1">Card</a></div></main>' +
    '<div id="stage" hidden><div class="m-wipe"></div></div>';
  const stage = document.getElementById("stage")!;
  // jsdom has no Web Animations API; the stage only asks for its running animations to cancel them.
  Object.assign(stage, { getAnimations: () => [] });
  registerWipeStage(stage);
  return document.getElementById("card")!;
}

describe("[P1-18] gold wipe sparks (FOLLOWUPS, P1-B close code review L4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    burst.mockClear();
  });
  afterEach(() => {
    settleWipe();
    registerWipeStage(null);
    vi.useRealTimers();
  });

  it("[P1-18] the sparks fly once, at their delay, when the wipe runs", () => {
    const card = mount();
    expect(startWipe("/shops/1", { clientX: 10, clientY: 10 }, card)).toBe(true);
    vi.advanceTimersByTime(WIPE.sparks.delayMs - 1);
    expect(burst, "no sparks before the delay").not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(burst, "one spark burst at the delay").toHaveBeenCalledTimes(1);
  });

  it("[P1-18] a dock tap or back before the sparks' delay leaves no sparks over the new page", () => {
    const card = mount();
    expect(startWipe("/shops/1", { clientX: 10, clientY: 10 }, card)).toBe(true);
    vi.advanceTimersByTime(WIPE.sparks.delayMs / 2);
    settleWipe();
    vi.advanceTimersByTime(WIPE.sparks.delayMs * 2);
    expect(burst, "the abandoned wipe's sparks were cancelled").not.toHaveBeenCalled();
  });
});
