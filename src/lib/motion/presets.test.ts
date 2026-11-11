import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOTION_PRESETS,
  STAGGER,
  originCss,
  placePopover,
  staggerDelay,
  staggerStyle,
  transformOriginFor,
} from "./presets";
import { NAV, enterKeyframes } from "./route-transitions";

describe("[P0-10] staggerDelay", () => {
  it("steps by the default 50ms from 0", () => {
    expect([0, 1, 2, 3].map((i) => staggerDelay(i))).toEqual([0, 50, 100, 150]);
  });

  it("clamps the step to 30–80ms", () => {
    expect(staggerDelay(1, 5)).toBe(30);
    expect(staggerDelay(1, 200)).toBe(80);
    expect(staggerDelay(2, 40)).toBe(80);
    expect(staggerDelay(1, Number.NaN)).toBe(STAGGER.defaultStepMs);
  });

  it("items after the 8th share the 8th's delay, so a long list never waits more than ~0.6s", () => {
    const eighth = staggerDelay(7, 80);
    expect(eighth).toBe(560);
    expect(staggerDelay(8, 80)).toBe(eighth);
    expect(staggerDelay(49, 80)).toBe(eighth);
    expect(
      Math.max(...Array.from({ length: 50 }, (_, i) => staggerDelay(i, 80))),
    ).toBeLessThanOrEqual(600);
  });

  it("treats a negative, fractional or non-finite index as the first item", () => {
    expect(staggerDelay(-3)).toBe(0);
    expect(staggerDelay(1.5)).toBe(0);
    expect(staggerDelay(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("staggerStyle hands the delay to CSS as --stagger-delay", () => {
    expect(staggerStyle(2)).toEqual({ "--stagger-delay": "100ms" });
  });
});

describe("[P0-10] transformOriginFor", () => {
  const popover = { left: 100, top: 200, width: 200, height: 120 };

  it("below the trigger: origin on the top edge, under the trigger's centre", () => {
    const trigger = { left: 120, top: 160, width: 40, height: 32 };
    expect(transformOriginFor(trigger, popover)).toEqual({ x: 40, y: 0 });
  });

  it("above the trigger: origin on the bottom edge", () => {
    const trigger = { left: 120, top: 330, width: 40, height: 32 };
    expect(transformOriginFor(trigger, popover)).toEqual({ x: 40, y: 120 });
  });

  it("left of the trigger: origin on the right edge; right of it: the left edge", () => {
    expect(transformOriginFor({ left: 320, top: 240, width: 40, height: 40 }, popover)).toEqual({
      x: 200,
      y: 60,
    });
    expect(transformOriginFor({ left: 40, top: 240, width: 40, height: 40 }, popover)).toEqual({
      x: 0,
      y: 60,
    });
  });

  it("a trigger wider than the popover: its centre, clamped inside the box", () => {
    expect(transformOriginFor({ left: 0, top: 160, width: 600, height: 32 }, popover)).toEqual({
      x: 200,
      y: 0,
    });
    expect(transformOriginFor({ left: 60, top: 160, width: 160, height: 32 }, popover)).toEqual({
      x: 40,
      y: 0,
    });
  });

  it("falls back to the centre for a box with no size or non-finite numbers", () => {
    expect(
      transformOriginFor({ left: Number.NaN, top: 0, width: 10, height: 10 }, popover),
    ).toEqual({ x: 100, y: 60 });
    expect(
      transformOriginFor({ left: 0, top: 0, width: 10, height: 10 }, { ...popover, width: 0 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("originCss writes px for CSS transform-origin", () => {
    expect(originCss({ x: 40, y: 0 })).toBe("40px 0px");
  });
});

describe("[P0-10] placePopover", () => {
  const viewport = { width: 390, height: 844 };
  const size = { width: 240, height: 160 };

  it("opens below the trigger, start-aligned, 8px away", () => {
    expect(placePopover({ left: 24, top: 100, width: 120, height: 44 }, size, viewport)).toEqual({
      left: 24,
      top: 152,
      side: "below",
    });
  });

  it("flips above when there is no room below", () => {
    const placed = placePopover({ left: 24, top: 760, width: 120, height: 44 }, size, viewport);
    expect(placed).toEqual({ left: 24, top: 592, side: "above" });
  });

  it("stays 16px inside the viewport for a trigger at the right edge", () => {
    const placed = placePopover({ left: 330, top: 100, width: 44, height: 44 }, size, viewport);
    expect(placed.left).toBe(390 - 16 - 240);
  });

  it("pins to the gutter when the popover is wider than the viewport", () => {
    const placed = placePopover(
      { left: 0, top: 100, width: 44, height: 44 },
      { width: 600, height: 100 },
      viewport,
    );
    expect(placed.left).toBe(16);
  });
});

/**
 * AC 6: the motion CSS animates transform and opacity only. A small walker turns globals.css into flat rules
 * (nested `@starting-style` blocks included) so the test reads each preset's transitions, the keyframes its
 * animations use, and the start/exit states it transitions from or to.
 */
type Rule = { selector: string; decls: Map<string, string> };

function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseRules(css: string, context = ""): Rule[] {
  const rules: Rule[] = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  let own = "";
  while (i < source.length) {
    const open = source.indexOf("{", i);
    const semi = source.indexOf(";", i);
    if (open === -1) {
      own += source.slice(i);
      break;
    }
    if (semi !== -1 && semi < open) {
      own += source.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }
    let depth = 1;
    let j = open + 1;
    for (; j < source.length && depth > 0; j++) {
      if (source[j] === "{") depth++;
      else if (source[j] === "}") depth--;
    }
    const prelude = source.slice(i, open).trim();
    const body = source.slice(open + 1, j - 1);
    // Inside @keyframes, `from`/`to`/`50%` belong to the keyframes; `@starting-style` nests under its rule;
    // other at-rules (@layer, @media) are transparent.
    const nested = context.startsWith("@keyframes")
      ? context
      : prelude.startsWith("@keyframes")
        ? prelude.replace(/\s+/g, " ")
        : prelude.startsWith("@starting-style")
          ? `${context} @starting-style`
          : prelude.startsWith("@")
            ? context
            : prelude;
    rules.push(...parseRules(body, nested));
    i = j;
  }
  const decls = new Map<string, string>();
  for (const d of splitTopLevel(own, ";")) {
    const colon = d.indexOf(":");
    if (colon > 0) decls.set(d.slice(0, colon).trim(), d.slice(colon + 1).trim());
  }
  if (decls.size > 0 && context) rules.push({ selector: context, decls });
  return rules;
}

const ALLOWED = new Set(["transform", "opacity"]);

function transitionedProps(decls: Map<string, string>): string[] {
  const property = decls.get("transition-property");
  if (property) return splitTopLevel(property, ",");
  const shorthand = decls.get("transition");
  if (!shorthand) return [];
  return splitTopLevel(shorthand, ",").map((t) => t.split(/\s+/)[0] ?? "");
}

function animationNames(decls: Map<string, string>): string[] {
  const name = decls.get("animation-name") ?? decls.get("animation")?.split(/\s+/)[0];
  return name ? [name] : [];
}

describe("[P0-10] motion CSS animates transform and opacity only (AC 6)", () => {
  const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
  const rules = parseRules(css);
  const keyframes = new Map(
    rules
      .filter((r) => r.selector.startsWith("@keyframes"))
      .map((r) => [r.selector.replace("@keyframes", "").trim(), r]),
  );
  const keyframeProps = (name: string): string[] =>
    rules.filter((r) => r.selector === `@keyframes ${name}`).flatMap((r) => [...r.decls.keys()]);

  const motionRules = rules.filter((r) =>
    Object.values(MOTION_PRESETS).some((p) => p.scan && r.selector.includes(p.selector)),
  );

  it("the walker finds every preset's rules and the route-transition rules", () => {
    for (const preset of Object.values(MOTION_PRESETS).filter((p) => p.scan)) {
      expect(
        rules.some((r) => r.selector.includes(preset.selector)),
        preset.selector,
      ).toBe(true);
    }
    expect(motionRules.some((r) => r.selector.includes("@starting-style"))).toBe(true);
    expect(keyframes.size).toBeGreaterThan(0);
  });

  it("transitions name only transform and opacity", () => {
    for (const rule of motionRules) {
      for (const prop of transitionedProps(rule.decls)) {
        expect(ALLOWED.has(prop), `${rule.selector}: transition ${prop}`).toBe(true);
      }
    }
  });

  it("start and exit states set only transform and opacity (plus timing and pointer-events)", () => {
    const harmless = /^(transition-duration|transition-delay|pointer-events|transform-origin)$/;
    const states = motionRules.filter(
      (r) =>
        r.selector.includes("@starting-style") ||
        r.selector.includes('[data-state="closing"]') ||
        r.selector.includes('[data-leaving="true"]'),
    );
    expect(states.length).toBeGreaterThan(0);
    for (const rule of states) {
      for (const prop of rule.decls.keys()) {
        expect(ALLOWED.has(prop) || harmless.test(prop), `${rule.selector}: ${prop}`).toBe(true);
      }
    }
  });

  it("keyframes the presets and route transitions use animate only transform and opacity", () => {
    const used = motionRules.flatMap((r) => animationNames(r.decls));
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) {
      const props = keyframeProps(name);
      expect(props.length, name).toBeGreaterThan(0);
      for (const prop of props) expect(ALLOWED.has(prop), `@keyframes ${name}: ${prop}`).toBe(true);
    }
  });

  it("view-transition rules only time the browser's own morph, never animate other properties", () => {
    const vt = rules.filter((r) => r.selector.includes("::view-transition"));
    expect(vt.length).toBeGreaterThan(0);
    for (const rule of vt) {
      for (const prop of rule.decls.keys()) {
        expect(prop, rule.selector).toMatch(
          /^(animation|animation-duration|animation-timing-function|pointer-events)$/,
        );
        if (prop === "animation") expect(rule.decls.get(prop)).toBe("none");
      }
    }
  });

  it("durations come from the motion tokens", () => {
    for (const rule of motionRules) {
      for (const [prop, value] of rule.decls) {
        if (!/^(transition|animation)/.test(prop)) continue;
        // A literal non-zero time; `0ms` (no delay) is not a duration choice.
        expect(value, `${rule.selector}: ${prop}`).not.toMatch(
          /(^|[\s,(])(?!0*\.?0+m?s\b)\d*\.?\d+m?s\b/,
        );
      }
    }
  });

  it("the WAAPI page enter animates transform and opacity only", () => {
    for (const type of [null, ...Object.values(NAV)]) {
      for (const frame of enterKeyframes(type, true)) {
        for (const prop of Object.keys(frame)) expect(ALLOWED.has(prop), prop).toBe(true);
      }
    }
  });
});

describe("[P0-10] no motion library at runtime (AC 9)", () => {
  it("package.json has no motion/framer-motion dependency (CSS + WAAPI only; DECISIONS needed to add one)", () => {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, "../../../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.filter((d) => /^(motion|framer-motion|@motionone\/.*)$/.test(d))).toEqual([]);
  });
});
