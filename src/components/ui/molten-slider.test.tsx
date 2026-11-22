// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  crossedNotches,
  SLIDER,
  sliderFraction,
  sliderTilt,
  sliderValue,
} from "@/lib/motion/controls";
import type * as FxModule from "@/lib/motion/fx";
import { Slider } from "./Slider";

const fx = vi.hoisted(() => ({ burst: vi.fn((_x: number, _y: number, _o?: unknown) => 0) }));
vi.mock("@/lib/motion/fx", async (orig) => ({
  ...(await orig<typeof FxModule>()),
  burst: fx.burst,
}));

beforeEach(() => {
  fx.burst.mockClear();
});
afterEach(() => {
  document.documentElement.classList.remove("rm");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("[PD-06] slider logic", () => {
  it("[PD-06] sliderValue clamps to the range and snaps to the step, like a native range input", () => {
    expect(sliderValue(240, 0, 720, 10)).toBe(240);
    expect(sliderValue(-5, 0, 720, 10)).toBe(0);
    expect(sliderValue(900, 0, 720, 10)).toBe(720);
    expect(sliderValue(244, 0, 720, 10)).toBe(240);
    // A tie rounds up (HTML's rule for range inputs).
    expect(sliderValue(245, 0, 720, 10)).toBe(250);
    // The step counts from min; a max off the step is not reachable, the last step below it is.
    expect(sliderValue(7, 1, 10, 3)).toBe(7);
    expect(sliderValue(10, 1, 10, 3)).toBe(10);
    expect(sliderValue(10, 0, 10, 3)).toBe(9);
    expect(sliderValue(0.3, 0, 1, 0.1)).toBeCloseTo(0.3, 10);
    // Not a number: the middle of the range (HTML's default value), on the step.
    expect(sliderValue(Number.NaN, 0, 720, 10)).toBe(360);
    // A broken range (max below min) holds min.
    expect(sliderValue(5, 10, 0, 1)).toBe(10);
    // A step of 0 or less means no stepping.
    expect(sliderValue(3.7, 0, 10, 0)).toBe(3.7);
  });

  it("[PD-06] sliderFraction is 0 at min and 1 at max, clamped, and 0 for an empty range", () => {
    expect(sliderFraction(0, 0, 720)).toBe(0);
    expect(sliderFraction(240, 0, 720)).toBeCloseTo(1 / 3, 10);
    expect(sliderFraction(720, 0, 720)).toBe(1);
    expect(sliderFraction(900, 0, 720)).toBe(1);
    expect(sliderFraction(-1, 0, 720)).toBe(0);
    expect(sliderFraction(5, 5, 5)).toBe(0);
  });

  it("[PD-06] sliderTilt leans against the movement, at the reference's rate, capped at ±28°", () => {
    // Reference: −(dv / max(16, dt)) × 60 on a 0–720 range. 10 gold in 100 ms → −6°.
    expect(sliderTilt(10 / 720, 100)).toBeCloseTo(-6, 6);
    expect(sliderTilt(-10 / 720, 100)).toBeCloseTo(6, 6);
    // Anything under 16 ms counts as 16 ms; fast moves hit the cap.
    expect(sliderTilt(240 / 720, 0)).toBe(-SLIDER.tiltMaxDeg);
    expect(sliderTilt(-240 / 720, 2)).toBe(SLIDER.tiltMaxDeg);
    expect(sliderTilt(0, 50)).toBe(0);
    expect(Object.is(sliderTilt(0, 50), -0)).toBe(false);
  });

  it("[PD-06] crossedNotches: each notch once per upward crossing; none going down, staying or for min", () => {
    const notches = [0, 240, 480, 720];
    expect(crossedNotches(230, 240, notches)).toEqual([240]);
    // Staying on or past a notch never sparks it again.
    expect(crossedNotches(240, 250, notches)).toEqual([]);
    expect(crossedNotches(250, 240, notches)).toEqual([]);
    // One jump across several (End, PageUp, a click far along): each crossed notch once, in order.
    expect(crossedNotches(240, 720, notches)).toEqual([480, 720]);
    expect(crossedNotches(0, 720, notches)).toEqual([240, 480, 720]);
    // Going down and back up crosses again.
    expect(crossedNotches(470, 480, notches)).toEqual([480]);
    expect(crossedNotches(720, 0, notches)).toEqual([]);
    // Unsorted notches still come out in value order.
    expect(crossedNotches(0, 720, [720, 240, 480])).toEqual([240, 480, 720]);
  });
});

const NOTCHES = [
  { value: 0, label: "0" },
  { value: 240, label: "Pastry" },
  { value: 480, label: "Coffee" },
  { value: 720, label: "All 720" },
] as const;

function Harness({
  initial = 240,
  onNotch,
}: {
  initial?: number;
  onNotch?: (n: number) => void;
}): React.JSX.Element {
  const [v, setV] = useState(initial);
  return (
    <Slider
      label="Gold to spend"
      min={0}
      max={720}
      step={10}
      value={v}
      onChange={setV}
      notches={NOTCHES}
      valueText={(n) => `${String(n)} of 720 gold`}
      {...(onNotch ? { onNotch } : {})}
    />
  );
}

const range = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("slider");
const bubble = (c: HTMLElement): HTMLElement => {
  const b = c.querySelector<HTMLElement>(".m-bubble");
  if (!b) throw new Error("no bubble");
  return b;
};

describe("[PD-06] Slider", () => {
  it("[PD-06] a native range input carries the label, range, step, value and value text", () => {
    render(<Harness />);
    const r = range();
    expect(r.type).toBe("range");
    expect(r).toHaveAccessibleName("Gold to spend");
    expect(r.min).toBe("0");
    expect(r.max).toBe("720");
    expect(r.step).toBe("10");
    expect(r.value).toBe("240");
    expect(r.getAttribute("aria-valuetext")).toBe("240 of 720 gold");
  });

  it("[PD-06] the bubble shows the value (en-GB), the fill and thumb follow it, reached notches light up", () => {
    const { container } = render(<Harness />);
    expect(bubble(container).textContent).toBe("240");
    const root = container.querySelector<HTMLElement>(".m-slider");
    expect(root?.style.getPropertyValue("--p")).toBe(String(240 / 720));
    const hit = [...container.querySelectorAll(".m-ticks span")].map((s) =>
      s.classList.contains("hit"),
    );
    // Min never counts as reached (the reference's `t > 0`).
    expect(hit).toEqual([false, true, false, false]);
    fireEvent.change(range(), { target: { value: "720" } });
    expect(bubble(container).textContent).toBe("720");
    expect(range().getAttribute("aria-valuetext")).toBe("720 of 720 gold");
    expect(
      [...container.querySelectorAll(".m-ticks span")].map((s) => s.classList.contains("hit")),
    ).toEqual([false, true, true, true]);
  });

  it("[PD-06] thousands are grouped the UK way", () => {
    const { container } = render(
      <Slider label="Gold" min={0} max={5000} step={100} value={1200} onChange={() => undefined} />,
    );
    expect(bubble(container).textContent).toBe("1,200");
  });

  it("[PD-06] crossing a notch sparks it once at the notch; a jump across several sparks each once", () => {
    const onNotch = vi.fn();
    render(<Harness initial={230} onNotch={onNotch} />);
    fireEvent.change(range(), { target: { value: "240" } });
    expect(onNotch.mock.calls).toEqual([[240]]);
    expect(fx.burst).toHaveBeenCalledTimes(1);
    expect(fx.burst.mock.calls[0]?.[2]).toMatchObject({
      type: "spark",
      count: SLIDER.sparks,
      speed: SLIDER.sparkSpeed,
    });
    // On past the notch, then back to it: no new spark.
    fireEvent.change(range(), { target: { value: "250" } });
    fireEvent.change(range(), { target: { value: "240" } });
    expect(onNotch).toHaveBeenCalledTimes(1);
    fireEvent.change(range(), { target: { value: "720" } });
    expect(onNotch.mock.calls.slice(1)).toEqual([[480], [720]]);
    expect(fx.burst).toHaveBeenCalledTimes(3);
  });

  it("[PD-06] a parent that refuses a value: the next move starts from the value it kept", async () => {
    const onNotch = vi.fn();
    render(
      <Slider
        label="Gold"
        min={0}
        max={720}
        step={10}
        value={230}
        onChange={() => undefined}
        notches={NOTCHES}
        onNotch={onNotch}
      />,
    );
    fireEvent.change(range(), { target: { value: "240" } });
    // Fired for the move the user made (the parent saw it) ...
    expect(onNotch).toHaveBeenCalledTimes(1);
    // ... and the input is back on 230, so the same move crosses again.
    expect(range().value).toBe("230");
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(range(), { target: { value: "240" } });
    expect(onNotch).toHaveBeenCalledTimes(2);
  });

  it("[PD-06] the bubble tilts with speed and springs back to 0° after 90 ms idle", () => {
    vi.useFakeTimers();
    const { container } = render(<Harness />);
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    fireEvent.change(range(), { target: { value: "250" } });
    now += 1;
    fireEvent.change(range(), { target: { value: "480" } });
    expect(bubble(container).style.getPropertyValue("--tilt")).toBe("-28.0deg");
    act(() => {
      vi.advanceTimersByTime(SLIDER.settleMs - 1);
    });
    expect(bubble(container).style.getPropertyValue("--tilt")).toBe("-28.0deg");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bubble(container).style.getPropertyValue("--tilt")).toBe("0deg");
  });

  it("[PD-06] reduced motion: no tilt (sparks are left to the FX engine, which draws none)", () => {
    document.documentElement.classList.add("rm");
    const onNotch = vi.fn();
    const { container } = render(<Harness initial={230} onNotch={onNotch} />);
    fireEvent.change(range(), { target: { value: "720" } });
    expect(bubble(container).style.getPropertyValue("--tilt")).toBe("");
    expect(onNotch).toHaveBeenCalledTimes(3);
  });

  it("[PD-06] an out-of-range or off-step value shows as the input does", () => {
    const { container } = render(
      <Slider label="Gold" min={0} max={720} step={10} value={9999} onChange={() => undefined} />,
    );
    expect(bubble(container).textContent).toBe("720");
    expect(range().value).toBe("720");
  });

  it("[PD-06] server render: disabled until hydrated (an early drag is never lost), thumb placed by CSS", () => {
    const html = renderToString(
      <Slider label="Gold" min={0} max={720} step={10} value={240} onChange={() => undefined} />,
    );
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).toContain("--p:0.3333333333333333");
  });
});
