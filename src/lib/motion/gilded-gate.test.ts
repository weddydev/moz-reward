import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  GATE,
  gateEntrySource,
  gateMorph,
  type GateMorph,
  gateOutlinePaths,
  gateScript,
  gateStorageKey,
} from "./gilded-gate";

describe("[P1-03] gateEntrySource", () => {
  it("plays only for a single src=qr or src=nfc", () => {
    expect(gateEntrySource("qr")).toBe("qr");
    expect(gateEntrySource("nfc")).toBe("nfc");
    for (const v of [undefined, "", "code", "QR", " qr", "qr ", "nfc\n", "web"]) {
      expect(gateEntrySource(v)).toBeNull();
    }
    expect(gateEntrySource(["qr", "nfc"])).toBeNull();
  });
});

describe("[P1-03] timeline", () => {
  it("lasts about 1.4 s and the steps follow DESIGN §8.1", () => {
    expect(GATE.totalMs).toBe(1400);
    expect(GATE.drawEndMs).toBe(200);
    expect(GATE.logoEndMs).toBe(700);
    expect(GATE.shimmerEndMs).toBe(1000);
    expect(GATE.reducedMs).toBeLessThanOrEqual(150);
    expect(GATE.riseStepMs).toBe(40);
  });
});

describe("[P1-03] gateStorageKey", () => {
  it("is one key per shop code", () => {
    expect(gateStorageKey("K7Q42M")).toBe("moz.gate.K7Q42M");
    expect(gateStorageKey("K7Q42M")).not.toBe(gateStorageKey("K7Q42N"));
  });
});

/** Runs the pre-paint script against a fake DOM and storage. */
function runScript(
  code: string,
  opts: { seen?: boolean; storage?: "ok" | "throws"; hidden?: boolean; noGate?: boolean } = {},
): {
  state: () => string | null;
  stored: Map<string, string>;
  fire: (type: string, init?: Record<string, unknown>) => void;
  end: (target: "gate" | "child") => void;
} {
  const attrs = new Map<string, string>();
  const winListeners = new Map<string, (e: unknown) => void>();
  const gateListeners = new Map<string, (e: unknown) => void>();
  const stored = new Map<string, string>(opts.seen ? [[gateStorageKey(code), "1"]] : []);
  const gate = {
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    addEventListener: (t: string, f: (e: unknown) => void) => gateListeners.set(t, f),
  };
  const storage =
    opts.storage === "throws"
      ? {
          getItem: () => {
            throw new Error("SecurityError");
          },
          setItem: () => {
            throw new Error("SecurityError");
          },
        }
      : {
          getItem: (k: string) => stored.get(k) ?? null,
          setItem: (k: string, v: string) => stored.set(k, v),
        };
  runInNewContext(gateScript(code), {
    document: {
      hidden: opts.hidden ?? false,
      getElementById: (id: string) => (id === GATE.id && !opts.noGate ? gate : null),
    },
    sessionStorage: storage,
    addEventListener: (t: string, f: (e: unknown) => void) => winListeners.set(t, f),
    removeEventListener: (t: string) => winListeners.delete(t),
  });
  return {
    state: () => attrs.get("data-state") ?? null,
    stored,
    fire: (type, init = {}) => winListeners.get(type)?.({ type, ...init }),
    end: (target) => gateListeners.get("animationend")?.({ target: target === "gate" ? gate : {} }),
  };
}

describe("[P1-03] gateScript (runs before first paint)", () => {
  it("first visit this session: plays and marks the shop as shown", () => {
    const r = runScript("K7Q42M");
    expect(r.state()).toBe("play");
    expect(r.stored.get("moz.gate.K7Q42M")).toBe("1");
  });

  it("already shown for this shop in this session: stays hidden (no replay on back or reload)", () => {
    const r = runScript("K7Q42M", { seen: true });
    expect(r.state()).toBeNull();
  });

  it("storage blocked or a background tab: no gate, nothing thrown", () => {
    expect(runScript("K7Q42M", { storage: "throws" }).state()).toBeNull();
    const hidden = runScript("K7Q42M", { hidden: true });
    expect(hidden.state()).toBeNull();
    expect(hidden.stored.size).toBe(0); // a tab opened in the background still plays when first seen
    expect(() => runScript("K7Q42M", { noGate: true })).not.toThrow();
  });

  it("tap, click, wheel or a key skips to the end; modifier keys alone don't", () => {
    for (const [type, init] of [
      ["click", {}],
      ["wheel", {}],
      ["keydown", { key: "Enter" }],
      ["keydown", { key: "Tab" }],
    ] as const) {
      const r = runScript("K7Q42M");
      r.fire(type, init);
      expect(r.state(), type).toBe("done");
    }
    const r = runScript("K7Q42M");
    r.fire("keydown", { key: "Shift" });
    expect(r.state()).toBe("play");
  });

  it("ends itself when the gate's own animation ends, not a child's", () => {
    const r = runScript("K7Q42M");
    r.end("child");
    expect(r.state()).toBe("play");
    r.end("gate");
    expect(r.state()).toBe("done");
    r.fire("click"); // listeners are gone: a later tap changes nothing
    expect(r.state()).toBe("done");
  });

  it("embeds the code as a JSON string, so markup in it can't break out of the script", () => {
    const s = gateScript('</script><script>alert(1)</script>"');
    expect(s).not.toContain("</script>");
    expect(s).toContain("\\u003c/script");
  });
});

/** gateMorph for boxes that must be usable. */
function morphOf(...args: Parameters<typeof gateMorph>): GateMorph {
  const m = gateMorph(...args);
  if (!m) throw new Error("expected a morph");
  return m;
}

describe("[P1-03] gateMorph (gate → cover shared element)", () => {
  const gate = { left: 111, top: 260, width: 168, height: 208 };
  const cover = { left: 0, top: 0, width: 390, height: 243.75 };

  it("starts as the gate: the clipped, scaled cover lands exactly on the gate's box", () => {
    const m = morphOf(gate, cover, 28, 0);
    const s = m.scale;
    // Local crop box → screen: cover.left + tx + local * s.
    const left = cover.left + m.tx + m.inset.x * s;
    const top = cover.top + m.ty + m.inset.y * s;
    const width = (cover.width - 2 * m.inset.x) * s;
    const height = (cover.height - 2 * m.inset.y) * s;
    expect(left).toBeCloseTo(gate.left, 6);
    expect(top).toBeCloseTo(gate.top, 6);
    expect(width).toBeCloseTo(gate.width, 6);
    expect(height).toBeCloseTo(gate.height, 6);
    expect(m.inset.x).toBeGreaterThanOrEqual(0);
    expect(m.inset.y).toBeGreaterThanOrEqual(0);
    // The radius is drawn in local px, so it reads as 28px on screen.
    expect(m.fromRadius * s).toBeCloseTo(28, 6);
  });

  it("ends as the cover: no transform, no clip but its own radius", () => {
    const m = morphOf(gate, cover, 28, 22);
    expect(m.keyframes.at(-1)).toMatchObject({
      transform: "none",
      clipPath: "inset(0px round 22px)",
    });
    expect(m.keyframes[0]?.transform).toMatch(/^translate\(.+px, .+px\) scale\(.+\)$/);
    expect(m.keyframes[0]?.clipPath).toMatch(/^inset\(.+px .+px round .+px\)$/);
  });

  it("works for a wide desktop cover and a tall gate alike (uniform scale, no distortion)", () => {
    const desk = { left: 40, top: 40, width: 600, height: 450 };
    const m = morphOf({ left: 556, top: 300, width: 168, height: 208 }, desk, 28, 22);
    expect(m.scale).toBeCloseTo(Math.max(168 / 600, 208 / 450), 9);
    expect(m.keyframes[0]?.transform).toMatch(/scale\([^,]+\)$/); // one value: uniform
  });

  it("returns null for an unusable box (collapsed, NaN or off by Infinity)", () => {
    expect(gateMorph(gate, { ...cover, width: 0 }, 28, 0)).toBeNull();
    expect(gateMorph({ ...gate, height: Number.NaN }, cover, 28, 0)).toBeNull();
    expect(gateMorph(gate, { ...cover, left: Infinity }, 28, 0)).toBeNull();
  });
});

describe("[P1-03] gateOutlinePaths", () => {
  it("two halves that start together at the top centre and meet at the bottom centre", () => {
    const [left, right] = gateOutlinePaths(168, 208, 28, 1);
    expect(left.startsWith("M84 1")).toBe(true);
    expect(right.startsWith("M84 1")).toBe(true);
    expect(left.endsWith("H84")).toBe(true);
    expect(right.endsWith("H84")).toBe(true);
  });
});
