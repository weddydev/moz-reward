import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colourTokens, spring, TOKEN_GROUPS, TYPE_SCALE } from "./tokens";

const css = readFileSync(path.join(__dirname, "tokens.css"), "utf8");
const globals = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
/** First hex declaration of each token (later ones are theme overrides). */
const declared = new Map<string, string>();
for (const [, name = "", hex = ""] of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g))
  if (!declared.has(name)) declared.set(name, hex);
/** Every custom property declared anywhere in tokens.css. */
const allDeclared = new Set([...css.matchAll(/^\s*--([\w-]+)\s*:/gm)].map((m) => m[1] ?? ""));
/** First declared value of each custom property (later ones are the reduced-motion overrides). */
const firstValues = new Map<string, string>();
for (const [, name = "", raw = ""] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
  if (!firstValues.has(name)) firstValues.set(name, raw.replace(/\s+/g, " ").trim());
}
const value = (name: string): string => firstValues.get(name) ?? "";
/** The body of each `@utility name { … }` block in globals.css. */
const utilities = new Map<string, string>();
for (const [, name = "", body = ""] of globals.matchAll(/@utility ([\w-]+) \{([\s\S]*?)\n\}/g)) {
  utilities.set(name, body);
}

describe("[P0-01] TS colour tokens mirror tokens.css", () => {
  it.each(Object.entries(colourTokens))("--%s matches", (name, value) => {
    expect(declared.get(name)?.toLowerCase()).toBe(value);
  });
});

describe("[P0-08] the token list shown on /dev/ui is complete", () => {
  const listed = TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => t.name));

  it("lists every custom property in tokens.css, and nothing that is not there", () => {
    expect([...listed].sort()).toEqual([...allDeclared].sort());
  });

  it("lists each token once, with a use", () => {
    expect(new Set(listed).size).toBe(listed.length);
    for (const group of TOKEN_GROUPS) for (const t of group.tokens) expect(t.use).not.toBe("");
  });
});

describe("[P0-08] tokens carry the DESIGN §3 / §7 values", () => {
  it.each([
    ["bg", "#fbf8f1"],
    ["surface", "#ffffff"],
    ["surface-2", "#f4eee2"],
    ["ink", "#1c1a17"],
    ["ink-2", "#5c564c"],
    ["ink-3", "#8e877b"],
    ["line", "#e8dfce"],
    ["gold-700", "#8a6a1f"],
    ["gold-500", "#c9a24a"],
    ["gold-300", "#e9d08a"],
    ["gold-100", "#f7edd0"],
    ["success", "#2f7d5b"],
    ["warning", "#b7791f"],
    ["danger", "#b3432f"],
    ["focus", "var(--ink)"],
    ["focus-ring", "var(--gold-500)"],
    ["r-sm", "8px"],
    ["r-md", "14px"],
    ["r-lg", "22px"],
    ["r-pill", "999px"],
    ["shadow-1", "0 1px 2px rgba(60, 45, 20, 0.06), 0 2px 8px rgba(60, 45, 20, 0.05)"],
    ["shadow-2", "0 8px 24px rgba(60, 45, 20, 0.1)"],
    ["shadow-gold", "0 6px 20px rgba(201, 162, 74, 0.28)"],
    ["dur-fast", "120ms"],
    ["dur-base", "220ms"],
    ["dur-slow", "380ms"],
    ["ease-out", "cubic-bezier(0.22, 1, 0.36, 1)"],
    ["ease-in-out", "cubic-bezier(0.65, 0, 0.35, 1)"],
  ])("--%s is %s", (name, expected) => {
    expect(value(name)).toBe(expected);
  });

  it("has the whole spacing scale", () => {
    for (const px of [4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96]) {
      expect(value(`space-${String(px)}`)).toBe(`${String(px)}px`);
    }
    expect(value("space-unit")).toBe("4px");
  });

  it("signature-moment duration sits inside 900–1600ms; the foil stays at or under 0.06", () => {
    const hero = parseInt(value("dur-hero"), 10);
    expect(hero).toBeGreaterThanOrEqual(900);
    expect(hero).toBeLessThanOrEqual(1600);
    expect(Number(value("foil-opacity"))).toBeLessThanOrEqual(0.06);
  });

  it("the spring is stiffness 380, damping 32", () => {
    expect(spring).toEqual({ type: "spring", stiffness: 380, damping: 32 });
  });
});

describe("[P0-08] reduced motion retunes the duration tokens (fades of at most 150ms)", () => {
  const blocks = css.split("@media (prefers-reduced-motion: reduce)")[1] ?? "";

  it("both the system rule and the user toggle shorten every everyday duration", () => {
    expect(blocks).toContain(':root:not([data-reduce-motion="false"])');
    expect(blocks).toContain(':root[data-reduce-motion="true"]');
    for (const name of ["dur-base", "dur-slow", "dur-hero", "dur-exit"]) {
      expect(blocks.split(`--${name}: var(--dur-reduced);`)).toHaveLength(3);
    }
    expect(value("dur-reduced")).toBe("150ms");
  });
});

describe("[P0-08] Tailwind theme reads the tokens (no duplicated values)", () => {
  const theme = /@theme inline \{([\s\S]*?)\n\}/.exec(globals)?.[1] ?? "";

  it("removes Tailwind's default palette, so only token colours exist", () => {
    expect(theme).toContain("--color-*: initial;");
  });

  it("every theme value is a var() reference or a font stack, never a literal", () => {
    const literal = [...theme.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)]
      .filter(([, name = "", v = ""]) => {
        if (name === "--color-*" || name.startsWith("--font-")) return false;
        return (
          !/^var\(--[\w-]+\)$/.test(v.trim()) && !["transparent", "currentColor"].includes(v.trim())
        );
      })
      .map(([, name]) => name);
    expect(literal).toEqual([]);
  });

  it("globals.css has no literal durations or colours outside comments", () => {
    const code = globals.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code.match(/\b\d+(\.\d+)?m?s\b/g) ?? []).toEqual([]);
    expect(code.match(/rgba?\(/g) ?? []).toEqual([]);
  });

  it("the type scale utilities carry the DESIGN §4 sizes", () => {
    for (const step of TYPE_SCALE) {
      const block = utilities.get(step.utility) ?? "";
      expect(block).toContain(`font-size: ${String(step.mobile)}px;`);
      if (step.desktop !== step.mobile) {
        expect(block).toContain(`font-size: ${String(step.desktop)}px;`);
      }
    }
  });
});
