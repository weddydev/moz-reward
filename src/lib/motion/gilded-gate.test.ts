import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  GATE,
  gateEntrySource,
  gateMorph,
  gateMorphScript,
  type GateMorph,
  gateTimeline,
  gateTitle,
  gateSceneScript,
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

describe("[PD-09] timeline (DESIGN §8.1, the reference intro's beats)", () => {
  it("keeps the reference's beat times", () => {
    expect(GATE.sparkMs).toBe(520);
    expect(GATE.convergeAt).toBe(300);
    expect(GATE.igniteAt).toBe(1250);
    expect(GATE.orbitAt).toBe(1420);
    expect(GATE.forge.at).toBe(1480);
    expect(GATE.shineAt).toBe(2350);
    expect(GATE.forge).toMatchObject({ leadMs: 120, staggerMs: 40, letterMs: 760 });
    expect(GATE.shine).toEqual({ durMs: 1200, staggerMs: 45 });
    expect(GATE.reducedMs).toBeLessThanOrEqual(150);
    expect(GATE.riseStepMs).toBe(40);
  });

  it("hands off once the name has forged: Brew & Bloom (10 letters) at 2720 ms, 3.12 s in all", () => {
    const t = gateTimeline(10);
    expect(t.staggerMs).toBe(40);
    expect(t.forgeEndMs).toBe(1480 + 120 + 9 * 40 + 760);
    expect(t.subDelayMs).toBe(120 + 10 * 40 + 200);
    expect(t.handoffMs).toBe(2720);
    expect(t.totalMs).toBe(3120);
  });

  it("never hands off before 2.4 s (a one-letter name)", () => {
    expect(gateTimeline(1).handoffMs).toBe(2400);
    expect(gateTimeline(0).handoffMs).toBe(2400);
  });

  it("long names: the stagger shrinks so the last letter lands by 3.2 s (gate ≤ 3.6 s)", () => {
    expect(gateTimeline(22).staggerMs).toBe(40);
    for (const n of [23, 40, 80]) {
      const t = gateTimeline(n);
      expect(t.staggerMs).toBeLessThan(40);
      expect(t.forgeEndMs).toBeCloseTo(3200, 9);
      expect(t.totalMs).toBeLessThanOrEqual(3600);
    }
  });
});

describe("[PD-09] gateTitle (letters forged one by one, wrapped by word)", () => {
  it("splits into words of letters and counts them (spaces aren't letters)", () => {
    expect(gateTitle("Brew & Bloom")).toMatchObject({
      words: [["B", "r", "e", "w"], ["&"], ["B", "l", "o", "o", "m"]],
      letters: 10,
    });
  });

  it("[PD-11] fits by the widest word in em, not the most letters: wide glyphs (M, W) count wide (FOLLOWUPS L6)", () => {
    const narrow = gateTitle("illicit WWW");
    // Three Ws are wider than seven narrow letters.
    expect(narrow.longestEm).toBeCloseTo(gateTitle("WWW").longestEm, 5);
    // Twelve Ms need far more room than the old flat 0.62 em a letter allowed (7.44 em): no clipping at 320.
    expect(gateTitle("MMMMMMMMMMMM").longestEm).toBeGreaterThan(11);
    // An everyday name stays close to the old estimate, so the reference's sizes don't move.
    const brew = gateTitle("Brew & Bloom");
    expect(brew.longestEm).toBeGreaterThan(5 * 0.5);
    expect(brew.longestEm).toBeLessThan(5 * 0.75);
  });

  it("keeps grapheme clusters whole and ignores extra spaces", () => {
    const t = gateTitle("  Café  👩‍🍳 Ltd ");
    expect(t.words).toEqual([["C", "a", "f", "é"], ["👩‍🍳"], ["L", "t", "d"]]);
    expect(t.letters).toBe(8);
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
  panelCancelled: () => number;
  sceneCancelled: () => number;
  stored: Map<string, string>;
  fire: (type: string, init?: Record<string, unknown>) => void;
  end: (target: "gate" | "child") => void;
  hide: () => void;
} {
  const attrs = new Map<string, string>();
  const panel = {
    cancelled: 0,
    getAnimations: () => [
      { cancel: () => (panel.cancelled += 1) },
      { cancel: () => (panel.cancelled += 1) },
    ],
  };
  // The scene's own animations (letters, coin, rays; forwards fill) sit beside the panel's under the gate.
  const scene = { cancelled: 0 };
  const sceneAnimations = [1, 2, 3].map(() => ({ cancel: () => (scene.cancelled += 1) }));
  const winListeners = new Map<string, (e: unknown) => void>();
  const gateListeners = new Map<string, (e: unknown) => void>();
  const stored = new Map<string, string>(opts.seen ? [[gateStorageKey(code), "1"]] : []);
  const gate = {
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    addEventListener: (t: string, f: (e: unknown) => void) => gateListeners.set(t, f),
    querySelector: (sel: string) => (sel === "[data-gate-panel]" ? panel : null),
    getAnimations: (o?: { subtree?: boolean }) =>
      o?.subtree ? [...panel.getAnimations(), ...sceneAnimations] : [],
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
  const docListeners = new Map<string, () => void>();
  const document = {
    hidden: opts.hidden ?? false,
    getElementById: (id: string) => (id === GATE.id && !opts.noGate ? gate : null),
    addEventListener: (t: string, f: () => void) => docListeners.set(t, f),
  };
  runInNewContext(gateScript(code), {
    document,
    sessionStorage: storage,
    addEventListener: (t: string, f: (e: unknown) => void) => winListeners.set(t, f),
    removeEventListener: (t: string) => winListeners.delete(t),
  });
  return {
    state: () => attrs.get("data-state") ?? null,
    panelCancelled: () => panel.cancelled,
    sceneCancelled: () => scene.cancelled,
    stored,
    fire: (type, init = {}) => winListeners.get(type)?.({ type, target: document, ...init }),
    end: (target) => gateListeners.get("animationend")?.({ target: target === "gate" ? gate : {} }),
    hide: () => {
      document.hidden = true;
      docListeners.get("visibilitychange")?.();
    },
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

  it("tap, click, a scroll (swipe), wheel or a key skips to the end; modifier keys alone don't", () => {
    for (const [type, init] of [
      ["click", {}],
      ["scroll", {}],
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
    r.fire("scroll", { target: {} }); // an inner scroller (or code scrolling one) is not the page
    expect(r.state()).toBe("play");
  });

  it("[PD-09] the tab going to the background ends it (it finishes at its end state)", () => {
    const r = runScript("K7Q42M");
    r.hide();
    expect(r.state()).toBe("done");
  });

  it("ends itself when the gate's own animation ends, not a child's", () => {
    const r = runScript("K7Q42M");
    r.end("child");
    expect(r.state()).toBe("play");
    r.end("gate");
    expect(r.state()).toBe("done");
    expect(r.panelCancelled()).toBe(2); // the morph stops with it (no DOM removal: React owns that node)
    // [PD-11] So does every scene animation left on the hidden gate (FOLLOWUPS L5).
    expect(r.sceneCancelled()).toBe(3);
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
    expect(m.move.at(-1)).toMatchObject({ transform: "none", opacity: 1 });
    expect(m.clip.at(-1)).toMatchObject({ clipPath: "inset(0px round 22px)" });
    expect(m.move[0]).toMatchObject({ opacity: 0 });
    expect(m.move[0]?.transform).toMatch(/^translate\(.+px, .+px\) scale\(.+\)$/);
    expect(m.clip[0]?.clipPath).toMatch(/^inset\(.+px .+px round .+px\)$/);
    // transform and clip-path never share an element (the transform can stay on the compositor).
    expect(m.move.some((k) => "clipPath" in k)).toBe(false);
    expect(m.clip.some((k) => "transform" in k)).toBe(false);
  });

  it("works for a wide desktop cover and a tall gate alike (uniform scale, no distortion)", () => {
    const desk = { left: 40, top: 40, width: 600, height: 450 };
    const m = morphOf({ left: 556, top: 300, width: 168, height: 208 }, desk, 28, 22);
    expect(m.scale).toBeCloseTo(Math.max(168 / 600, 208 / 450), 9);
    expect(m.move[0]?.transform).toMatch(/scale\([^,]+\)$/); // one value: uniform
  });

  it("returns null for an unusable box (collapsed, NaN or off by Infinity)", () => {
    expect(gateMorph(gate, { ...cover, width: 0 }, 28, 0)).toBeNull();
    expect(gateMorph({ ...gate, height: Number.NaN }, cover, 28, 0)).toBeNull();
    expect(gateMorph(gate, { ...cover, left: Infinity }, 28, 0)).toBeNull();
  });
});

describe("[P1-03] gateMorphScript (inlined, so its functions must stand alone)", () => {
  it("gateMorph's own source gives the same result in a bare context", () => {
    const bare = runInNewContext(`(${gateMorph.toString()})`, {
      Math,
      Number,
      String,
    }) as typeof gateMorph;
    const args = [
      { left: 111, top: 260, width: 168, height: 208 },
      { left: 0, top: 0, width: 390, height: 243.75 },
      28,
      0,
    ] as const;
    expect(JSON.stringify(bare(...args))).toBe(JSON.stringify(gateMorph(...args)));
  });

  it("parses, and does nothing (no throw) when there is no gate or it isn't playing", () => {
    const script = gateMorphScript(2720);
    expect(script).not.toContain("</script");
    const run = (document: object) => (): void => {
      runInNewContext(script, { document });
    };
    expect(run({ getElementById: () => null })).not.toThrow();
    expect(run({ getElementById: () => ({ getAttribute: () => "done" }) })).not.toThrow();
  });

  it("reads the gate's animations in the first frame, never during parse (no forced style in the parser's task)", () => {
    const script = gateMorphScript(2720);
    let reads = 0;
    const frames: Array<() => void> = [];
    const gate = {
      getAttribute: () => "play",
      getAnimations: () => {
        reads++;
        return [];
      },
    };
    runInNewContext(script, {
      document: { getElementById: () => gate },
      requestAnimationFrame: (f: () => void) => {
        frames.push(f);
      },
    });
    // KI-48 (CI 45633357321): a synchronous getAnimations() recalculated the whole document's style inside the
    // inline script, a 68–81 ms task at 4× CPU. First paint does that work anyway; the frame after it reads it free.
    expect(reads).toBe(0);
    expect(frames).toHaveLength(1);
    frames[0]?.();
    expect(reads).toBe(1);
  });
});

describe("[PD-09] gateSceneScript (inlined after the gate markup)", () => {
  it("parses, holds no closing script tag, and does nothing when there is no gate or it isn't playing", () => {
    const script = gateSceneScript(gateTimeline(10));
    expect(script).not.toContain("</script");
    const run = (document: object) => (): void => {
      runInNewContext(script, { document, Math });
    };
    expect(run({ getElementById: () => null })).not.toThrow();
    expect(run({ getElementById: () => ({ getAttribute: () => "done" }) })).not.toThrow();
  });

  it("waits for the CSS timeline (gate-life) and draws nothing under reduced motion (gate-fade)", () => {
    const script = gateSceneScript(gateTimeline(10));
    let readCalls = 0;
    const gate = {
      getAttribute: () => "play",
      getAnimations: () => {
        readCalls++;
        return [{ animationName: "gate-fade" }];
      },
    };
    expect(() => {
      runInNewContext(script, {
        document: { getElementById: () => gate },
        Math,
        requestAnimationFrame: (f: () => void) => {
          f();
        },
      });
    }).not.toThrow();
    expect(readCalls).toBe(1);
  });
});
