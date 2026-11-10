import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BODY,
  colourLabel,
  contrast,
  CONTRAST_PAIRS,
  contrastResults,
  parseHex,
  resolveColour,
} from "./contrast";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");
/** First declaration of each token with a 6-digit hex value (later ones are theme overrides). */
const declared = new Map<string, string>();
for (const [, name = "", hex = ""] of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g))
  if (!declared.has(name)) declared.set(name, hex);
const token = (name: string): string => {
  const hex = declared.get(name);
  if (!hex) throw new Error(`token --${name} not found`);
  return hex;
};

describe("[P0-08] contrast maths (WCAG 2.2)", () => {
  it("black on white is 21:1, a colour on itself 1:1", () => {
    expect(contrast(parseHex("#000000"), parseHex("#ffffff"))).toBeCloseTo(21, 5);
    expect(contrast(parseHex("#8a6a1f"), parseHex("#8a6a1f"))).toBeCloseTo(1, 5);
  });

  it("mixes two tokens like color-mix(in srgb)", () => {
    const mixed = resolveColour({ mix: ["a", 25, "b"] }, (t) =>
      t === "a" ? "#000000" : "#ffffff",
    );
    expect(mixed.map(Math.round)).toEqual([191, 191, 191]);
  });

  it("refuses anything that is not a 6-digit hex colour", () => {
    expect(() => parseHex("rgb(0,0,0)")).toThrow(/hex/);
  });
});

describe("[P0-08] token contrast (WCAG AA)", () => {
  it.each(contrastResults(token).map((r) => [colourLabel(r.fg), colourLabel(r.bg), r] as const))(
    "%s on %s meets its minimum",
    (_fg, _bg, result) => {
      expect(result.ratio).toBeGreaterThanOrEqual(result.min);
    },
  );

  it("the mixes in the pair list are the mixes tokens.css declares", () => {
    expect(css).toContain("--success-tint: color-mix(in srgb, var(--success) 6%, var(--surface));");
    expect(css).toContain(
      "--warning-tint: color-mix(in srgb, var(--warning) 14%, var(--surface));",
    );
  });

  it("every body-text pair is at least 4.5:1 and the list covers the text colours on each background", () => {
    const body = CONTRAST_PAIRS.filter((p) => p.min === BODY);
    expect(body.length).toBeGreaterThanOrEqual(14);
    for (const bg of ["bg", "surface", "surface-2"]) {
      expect(body.some((p) => p.fg === "ink" && p.bg === bg)).toBe(true);
      expect(body.some((p) => p.fg === "ink-2" && p.bg === bg)).toBe(true);
    }
  });
});
