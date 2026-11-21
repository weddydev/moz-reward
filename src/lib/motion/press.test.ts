// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { animOptions, EASE_OUT, RM_MAX_MS } from "./anim";
import { countUp, countUpAt, formatCount, magneticOffset, PRESS, ripple } from "./press";

const realAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");

afterEach(() => {
  // jsdom has no Web Animations; the ripple tests put a stub on the prototype.
  if (realAnimate) Object.defineProperty(Element.prototype, "animate", realAnimate);
  else Reflect.deleteProperty(Element.prototype, "animate");
  document.documentElement.classList.remove("rm");
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("[PD-03] anim(): Molten defaults, capped under reduced motion", () => {
  it("[PD-03] fill both + ease-out by default; the caller's options win", () => {
    expect(animOptions({ duration: 720 }, false)).toEqual({
      fill: "both",
      easing: EASE_OUT,
      duration: 720,
    });
    expect(animOptions({ duration: 300, easing: "linear", fill: "none" }, false)).toMatchObject({
      easing: "linear",
      fill: "none",
    });
  });

  it("[PD-03] reduced motion: ≤ 150 ms and no delay (a missing duration becomes 150)", () => {
    expect(animOptions({ duration: 720, delay: 400 }, true)).toMatchObject({
      duration: RM_MAX_MS,
      delay: 0,
    });
    expect(animOptions({ duration: 90 }, true).duration).toBe(90);
    expect(animOptions({}, true).duration).toBe(150);
  });
});

describe("[PD-03] press kit", () => {
  it("[PD-03] magnetic lean: ±8 px x, ±6 px y, toward the pointer, 0 at the centre", () => {
    expect(magneticOffset(100, 27, 200, 54)).toEqual({ tx: 0, ty: 0 });
    expect(magneticOffset(200, 54, 200, 54)).toEqual({ tx: 8, ty: 6 });
    expect(magneticOffset(0, 0, 200, 54)).toEqual({ tx: -8, ty: -6 });
    expect(magneticOffset(130, 31, 200, 54)).toEqual({ tx: 3, ty: 1 });
  });

  it("[PD-03] count-up: cubic out from → to, clamped; en-GB thousands", () => {
    expect(countUpAt(0, 1000, 0)).toBe(0);
    expect(countUpAt(0, 1000, 1)).toBe(1000);
    expect(countUpAt(0, 1000, 0.5)).toBeCloseTo(875, 10);
    expect(countUpAt(200, 100, 2)).toBe(100);
    expect(formatCount(1240.4)).toBe("1,240");
    expect(PRESS.countUpMs).toBe(700);
  });

  it("[PD-03] count-up under reduced motion shows the end value at once, in React's own text node", () => {
    document.documentElement.classList.add("rm");
    const el = document.createElement("span");
    el.textContent = "80";
    const node = el.firstChild;
    const raf = vi.spyOn(window, "requestAnimationFrame");
    countUp(el, 1240, 700, 80);
    expect(el.textContent).toBe("1,240");
    expect(el.firstChild).toBe(node);
    expect(raf).not.toHaveBeenCalled();
  });

  it("[PD-03] count-up cancel shows the end value and stops the frames", () => {
    const el = document.createElement("span");
    el.textContent = "0";
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const stop = countUp(el, 500, 700, 0);
    expect(el.textContent).toBe("0");
    stop();
    expect(el.textContent).toBe("500");
    expect(cancel).toHaveBeenCalled();
  });

  it("[PD-03] ripple: a gold circle 2.4 × the longer side, centred on the press point, aria-hidden", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      width: 200,
      height: 54,
      right: 210,
      bottom: 74,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    const animate = vi.fn(() => ({ onfinish: null }) as unknown as Animation);
    Element.prototype.animate = animate;
    ripple(btn, { clientX: 60, clientY: 40 });
    const s = btn.querySelector<HTMLElement>(".m-ripple");
    expect(s?.getAttribute("aria-hidden")).toBe("true");
    expect(s?.style.width).toBe("480px");
    expect(s?.style.left).toBe(`${50 - 240}px`);
    expect(s?.style.top).toBe(`${20 - 240}px`);
    expect(animate).toHaveBeenCalledWith(
      [
        { transform: "scale(.04)", opacity: 1 },
        { transform: "scale(1)", opacity: 0 },
      ],
      expect.objectContaining({ duration: 720 }),
    );
  });

  it("[PD-03] ripple from a keyboard press (no point) starts at the centre", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 40,
      right: 100,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Element.prototype.animate = () => ({ onfinish: null }) as unknown as Animation;
    ripple(btn, { clientX: 0, clientY: 0 });
    const s = btn.querySelector<HTMLElement>(".m-ripple");
    expect(s?.style.left).toBe(`${50 - 120}px`);
    expect(s?.style.top).toBe(`${20 - 120}px`);
  });
});
