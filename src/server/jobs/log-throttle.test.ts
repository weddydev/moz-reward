import { describe, expect, it } from "vitest";
import { createLogThrottle } from "./log-throttle";

describe("[P0-13] log spikes: repeated identical errors are logged once per window with a count", () => {
  it("first occurrence logs, repeats are counted, the next window reports how many were held back", () => {
    let t = 0;
    const lines: Array<{ key: string; repeated: number }> = [];
    const throttle = createLogThrottle({ windowMs: 30_000, now: () => t });
    const hit = (key: string): void => {
      throttle(key, (repeated) => lines.push({ key, repeated }));
    };
    hit("email:ECONNREFUSED");
    for (let i = 0; i < 99; i++) hit("email:ECONNREFUSED");
    hit("pdf:ECONNREFUSED"); // another key: its own window
    expect(lines).toEqual([
      { key: "email:ECONNREFUSED", repeated: 0 },
      { key: "pdf:ECONNREFUSED", repeated: 0 },
    ]);
    t = 30_001;
    hit("email:ECONNREFUSED");
    expect(lines.at(-1)).toEqual({ key: "email:ECONNREFUSED", repeated: 99 });
  });

  it("keeps a bounded number of keys (a flood of distinct messages can't grow memory)", () => {
    const throttle = createLogThrottle({ windowMs: 30_000, maxKeys: 3, now: () => 0 });
    let logged = 0;
    for (let i = 0; i < 10; i++) throttle(`k${String(i)}`, () => (logged += 1));
    expect(logged).toBe(10);
    expect(throttle.size()).toBeLessThanOrEqual(3);
  });
});
