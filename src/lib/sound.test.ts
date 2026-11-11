// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPreferencesForTest, setSoundPreference, STORAGE_KEYS } from "./preferences";
import { armSound, play, resetSoundForTest, SOUNDS, type SoundName } from "./sound";

type Ramp = { kind: "set" | "linear" | "exp"; value: number; at: number };
type FakeParam = { ramps: Ramp[]; value: number };
type FakeOsc = {
  type: string;
  frequency: FakeParam;
  detune: FakeParam;
  startedAt: number | null;
  stoppedAt: number | null;
  gain: FakeGain | null;
};
type FakeGain = { gain: FakeParam; toDestination: boolean };

const param = (value = 0): FakeParam & Record<string, unknown> => {
  const p: FakeParam & Record<string, unknown> = { ramps: [], value };
  p.setValueAtTime = (v: number, at: number) => p.ramps.push({ kind: "set", value: v, at });
  p.linearRampToValueAtTime = (v: number, at: number) =>
    p.ramps.push({ kind: "linear", value: v, at });
  p.exponentialRampToValueAtTime = (v: number, at: number) =>
    p.ramps.push({ kind: "exp", value: v, at });
  return p;
};

let contexts: FakeContext[] = [];

class FakeContext {
  state: "suspended" | "running" | "closed";
  currentTime = 10;
  destination = { isDestination: true };
  oscillators: FakeOsc[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  constructor() {
    this.state = FakeContext.startState;
    contexts.push(this);
  }
  static startState: "suspended" | "running" = "suspended";
  createOscillator(): unknown {
    const osc: FakeOsc & Record<string, unknown> = {
      type: "sine",
      frequency: param(440),
      detune: param(0),
      startedAt: null,
      stoppedAt: null,
      gain: null,
    };
    osc.connect = (node: FakeGain) => {
      osc.gain = node;
    };
    osc.start = (at: number) => {
      osc.startedAt = at;
    };
    osc.stop = (at: number) => {
      osc.stoppedAt = at;
    };
    this.oscillators.push(osc);
    return osc;
  }
  createGain(): unknown {
    const node: FakeGain & Record<string, unknown> = { gain: param(1), toDestination: false };
    node.connect = (target: { isDestination?: boolean }) => {
      node.toDestination = target.isDestination === true;
    };
    this.gains.push(node);
    return node;
  }
}

const gesture = (type = "pointerdown"): void => {
  window.dispatchEvent(new Event(type));
};
const only = (): FakeContext => {
  expect(contexts).toHaveLength(1);
  return contexts[0] as FakeContext;
};
const hidden = (value: boolean): void => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
};

beforeEach(() => {
  contexts = [];
  FakeContext.startState = "suspended";
  vi.stubGlobal("AudioContext", FakeContext);
  window.localStorage.clear();
  resetPreferencesForTest();
  resetSoundForTest();
  hidden(false);
});
afterEach(() => {
  resetSoundForTest();
  vi.unstubAllGlobals();
});

describe("[P0-11] sound: nothing before a gesture", () => {
  it("creates no AudioContext at import, when armed, or when asked to play before a gesture", () => {
    armSound();
    expect(play("credit")).toBe(false);
    expect(play("arrival")).toBe(false);
    expect(contexts).toHaveLength(0);
  });

  it("creates and resumes the context inside the first gesture, then plays", () => {
    armSound();
    gesture();
    const ctx = only();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(play("tick")).toBe(true);
    expect(ctx.oscillators).toHaveLength(1);
  });

  it.each(["pointerdown", "keydown", "touchend"])("unlocks on %s", (type) => {
    armSound();
    gesture(type);
    expect(contexts).toHaveLength(1);
  });

  it("stops listening once the context runs: one context however many gestures", () => {
    armSound();
    armSound();
    gesture();
    gesture("keydown");
    gesture();
    expect(only().resume).toHaveBeenCalledTimes(1);
  });

  it("plays at once inside the unlocking gesture, while the resume is still settling", () => {
    armSound();
    gesture();
    const ctx = only();
    ctx.state = "suspended"; // a real resume() flips the state a moment later
    expect(play("tick")).toBe(true);
  });

  it("a context the browser left suspended is resumed on the next gesture, and nothing plays meanwhile", async () => {
    armSound();
    gesture();
    const ctx = only();
    await Promise.resolve(); // the resume settled
    ctx.state = "suspended"; // e.g. iOS suspended it again after the tab was in the background
    expect(play("credit")).toBe(false);
    expect(ctx.oscillators).toHaveLength(0);
    gesture(); // play() re-armed the listeners
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(play("credit")).toBe(true);
  });

  it("does nothing (and does not throw) where AudioContext is missing", () => {
    vi.stubGlobal("AudioContext", undefined);
    armSound();
    gesture();
    expect(play("reward")).toBe(false);
  });

  it("survives a constructor that throws (blocked audio): no sound, no error", () => {
    vi.stubGlobal("AudioContext", function Blocked() {
      throw new Error("blocked");
    });
    armSound();
    expect(() => {
      gesture();
    }).not.toThrow();
    expect(play("tick")).toBe(false);
  });
});

describe("[P0-11] sound: the toggle is respected", () => {
  it("off: no context on a gesture and nothing plays", async () => {
    await setSoundPreference(false);
    armSound();
    gesture();
    expect(contexts).toHaveLength(0);
    expect(play("credit")).toBe(false);
  });

  it("switched off after unlocking: nothing plays; switched on again: plays", async () => {
    armSound();
    gesture();
    await setSoundPreference(false);
    expect(play("credit")).toBe(false);
    expect(only().oscillators).toHaveLength(0);
    await setSoundPreference(true);
    expect(play("credit")).toBe(true);
  });

  it("switched on later: the next gesture (the toggle's own tap) unlocks", async () => {
    window.localStorage.setItem(STORAGE_KEYS.sound, "off");
    armSound();
    gesture();
    expect(contexts).toHaveLength(0);
    await setSoundPreference(true);
    gesture();
    expect(contexts).toHaveLength(1);
    expect(play("tick")).toBe(true);
  });

  it("a hidden tab stays silent", () => {
    armSound();
    gesture();
    hidden(true);
    expect(play("tick")).toBe(false);
  });
});

describe("[P0-11] sound: what each name plays (DESIGN §9)", () => {
  const played = (name: SoundName): FakeContext => {
    armSound();
    gesture();
    expect(play(name)).toBe(true);
    return only();
  };
  const freqs = (ctx: FakeContext): number[] =>
    ctx.oscillators.map((o) => o.frequency.ramps[0]?.value ?? 0);
  const length = (ctx: FakeContext): number =>
    Math.round(
      (Math.max(...ctx.oscillators.map((o) => o.stoppedAt ?? 0)) - ctx.currentTime) * 1000,
    );

  it("credit: two notes rising a fifth (E5 → B5), 180ms", () => {
    const ctx = played("credit");
    expect(freqs(ctx).map(Math.round)).toEqual([659, 988]);
    expect((freqs(ctx)[1] ?? 0) / (freqs(ctx)[0] ?? 1)).toBeCloseTo(1.5, 1);
    expect(length(ctx)).toBe(180);
  });

  it("reward: C6, E6, G6 with a detuned partial, 420ms", () => {
    const ctx = played("reward");
    expect([...new Set(freqs(ctx).map(Math.round))]).toEqual([1047, 1319, 1568]);
    expect(ctx.oscillators.some((o) => o.detune.value !== 0)).toBe(true);
    expect(length(ctx)).toBe(420);
  });

  it("tick: one 1.2 kHz blip, 40ms", () => {
    const ctx = played("tick");
    expect(freqs(ctx)).toEqual([1200]);
    expect(length(ctx)).toBe(40);
  });

  it("arrival: one voice gliding low to high, 300ms", () => {
    const ctx = played("arrival");
    expect(ctx.oscillators).toHaveLength(1);
    const ramps = ctx.oscillators[0]?.frequency.ramps ?? [];
    expect(ramps.at(-1)?.value).toBeGreaterThan(ramps[0]?.value ?? Infinity);
    expect(length(ctx)).toBe(300);
  });

  it.each(Object.keys(SOUNDS) as SoundName[])(
    "%s: soft sine/triangle voices, 5ms attack (the swell aside), exponential decay, gain ≤ 0.18",
    (name) => {
      const ctx = played(name);
      expect(ctx.oscillators.length).toBeGreaterThan(0);
      for (const osc of ctx.oscillators) {
        expect(["sine", "triangle"]).toContain(osc.type);
        expect(osc.startedAt).not.toBeNull();
        expect(osc.stoppedAt).toBeGreaterThan(osc.startedAt ?? Infinity);
        const env = osc.gain?.gain.ramps ?? [];
        const [from, attack, decay] = env;
        expect(from?.kind).toBe("set");
        expect(from?.value).toBeLessThan(0.001);
        expect(attack?.kind).toBe("linear");
        if (name !== "arrival") expect((attack?.at ?? 0) - (from?.at ?? 0)).toBeCloseTo(0.005, 4);
        expect(decay?.kind).toBe("exp");
        expect(decay?.value).toBeGreaterThan(0); // an exponential ramp can't reach 0
        expect(osc.gain?.toDestination).toBe(true);
      }
      // Voices that sound at the same moment never add up past the cap.
      const peaks = ctx.oscillators.map((o) => ({
        at: o.gain?.gain.ramps[1]?.at ?? 0,
        peak: o.gain?.gain.ramps[1]?.value ?? 0,
        end: o.stoppedAt ?? 0,
        start: o.startedAt ?? 0,
      }));
      for (const p of peaks) {
        const together = peaks
          .filter(
            (q) => q.start <= p.at && q.at <= p.at + 1e-6 && q.end > p.at && q.at >= p.at - 1e-6,
          )
          .reduce((sum, q) => sum + q.peak, 0);
        expect(together).toBeLessThanOrEqual(0.18 + 1e-9);
        expect(p.peak).toBeGreaterThan(0);
      }
    },
  );

  it("starts at the context's current time (no queueing behind an earlier sound)", () => {
    const ctx = played("tick");
    ctx.currentTime = 42;
    play("tick");
    expect(ctx.oscillators[1]?.startedAt).toBe(42);
  });
});
