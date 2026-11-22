// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCount } from "@/lib/motion/press";
import { useCountUp } from "./press";

function Count({ value, ms }: { value: number; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, value, ms);
  return <span ref={ref}>{formatCount(value)}</span>;
}

let frames: FrameRequestCallback[] = [];
let clock = 0;

function stubFrames(): void {
  frames = [];
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames[id - 1] = () => undefined;
  });
}

/** Runs the latest pending frame at time `t`. */
function frameAt(t: number): void {
  clock = t;
  const cb = frames[frames.length - 1];
  cb?.(t);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("[PD-03] useCountUp", () => {
  it("[PD-03] the first render shows the value without counting", () => {
    stubFrames();
    const { container } = render(<Count value={1240} />);
    expect(container.textContent).toBe("1,240");
    expect(frames).toHaveLength(0);
  });

  it("[PD-03] an interrupted count starts the new one from the number on screen, not the old target", () => {
    stubFrames();
    const { container, rerender } = render(<Count value={0} ms={700} />);
    rerender(<Count value={1000} ms={700} />);
    frameAt(350); // half way 0 → 1000 (cubic out): 875
    expect(container.textContent).toBe("875");

    rerender(<Count value={2000} ms={700} />);
    // No jump to 1,000 (the old target): the new count's first frame (before paint) is at 875. Nothing is written
    // before that frame (PD-06, the reference's countUp).
    frameAt(350);
    expect(container.textContent).toBe("875");
    frameAt(1050);
    expect(container.textContent).toBe("2,000");
  });

  it("[PD-03] a duration change mid-count finishes at the target instead of freezing", () => {
    stubFrames();
    const { container, rerender } = render(<Count value={0} ms={700} />);
    rerender(<Count value={1000} ms={700} />);
    frameAt(350);
    rerender(<Count value={1000} ms={400} />);
    expect(container.textContent).toBe("875");
    frameAt(750);
    expect(container.textContent).toBe("1,000");
  });
});
