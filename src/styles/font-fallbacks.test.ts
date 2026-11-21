import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Metrics = {
  ascent: number;
  descent: number;
  lineGap: number;
  unitsPerEm: number;
  xWidthAvg: number;
};

const require = createRequire(import.meta.url);
const METRICS = require("next/dist/server/capsize-font-metrics.json") as Record<string, Metrics>;
const css = readFileSync("src/styles/font-fallbacks.css", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

/** next/font's own formula (it produced the Arial face: 103.19% / 103.31% / 29.07%). */
function overrides(main: Metrics, fallback: Metrics): Record<string, string> {
  const size = main.xWidthAvg / main.unitsPerEm / (fallback.xWidthAvg / fallback.unitsPerEm);
  // Two decimals, trailing zeros dropped (how Prettier writes them: 100.30% → 100.3%).
  const pct = (v: number): string => `${String(Number((v * 100).toFixed(2)))}%`;
  return {
    "size-adjust": pct(size),
    "ascent-override": pct(main.ascent / (main.unitsPerEm * size)),
    "descent-override": pct(Math.abs(main.descent) / (main.unitsPerEm * size)),
    "line-gap-override": pct(main.lineGap / (main.unitsPerEm * size)),
  };
}

function face(family: string): Record<string, string> {
  const block =
    new RegExp(`@font-face \\{\\s*font-family: "${family}";([^}]*)\\}`).exec(css)?.[1] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]),
  );
}

describe("[PD-02] Manrope fallbacks where Arial doesn't exist (no swap shift on Android or Linux)", () => {
  const manrope = METRICS.manrope;
  const arial = METRICS.arial;
  const roboto = METRICS.roboto;
  if (!manrope || !arial || !roboto) throw new Error("Next's font metrics changed shape");

  it("[PD-02] Liberation Sans takes next/font's Arial overrides (same metrics)", () => {
    const f = face("Manrope Fallback Liberation");
    expect(f.src).toContain('local("Liberation Sans")');
    expect({ ...f, src: undefined }).toMatchObject(overrides(manrope, arial));
  });

  it("[PD-02] Roboto gets its own overrides from Next's capsize metrics", () => {
    const f = face("Manrope Fallback Roboto");
    expect(f.src).toContain('local("Roboto")');
    expect({ ...f, src: undefined }).toMatchObject(overrides(manrope, roboto));
  });

  it("[PD-02] Fraunces: Liberation Serif takes the Times overrides, Noto Serif (Android) its own", () => {
    const fraunces = METRICS.fraunces;
    const times = METRICS.timesNewRoman;
    const noto = METRICS.notoSerif;
    if (!fraunces || !times || !noto) throw new Error("Next's font metrics changed shape");
    const lib = face("Fraunces Fallback Liberation");
    expect(lib.src).toContain('local("Liberation Serif")');
    expect({ ...lib, src: undefined }).toMatchObject(overrides(fraunces, times));
    const n = face("Fraunces Fallback Noto");
    expect(n.src).toContain('local("Noto Serif")');
    expect({ ...n, src: undefined }).toMatchObject(overrides(fraunces, noto));
    expect(globals).toMatch(
      /--font-display:\s*var\(--font-fraunces\),\s*"Fraunces Fallback Liberation",\s*"Fraunces Fallback Noto",/,
    );
  });

  it("[PD-02] both come right after next/font's Arial fallback in the UI stack", () => {
    expect(globals).toMatch(
      /--font-sans:\s*var\(--font-manrope\),\s*"Manrope Fallback Liberation",\s*"Manrope Fallback Roboto",/,
    );
    expect(globals).toContain('@import "../styles/font-fallbacks.css"');
  });
});
