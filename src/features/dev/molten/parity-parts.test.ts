import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addParityHooks, PARITY_PARTS, parityLimit, withAppFonts } from "./parity-parts";

const ROOT = path.resolve(__dirname, "../../../..");
const original = readFileSync(path.join(ROOT, "design/reference/molten/index.html"), "utf8");
const copy = readFileSync(path.join(ROOT, "tests/parity/reference/index.html"), "utf8");

describe("[PD-01] parity parts and the reference copy", () => {
  it("[PD-01] every part gets exactly one data-parity hook, on an element", () => {
    const hooked = addParityHooks(original);
    for (const part of PARITY_PARTS) {
      const hits = hooked.split(`data-parity="${part.name}"`).length - 1;
      expect(hits, part.name).toBe(1);
      expect(hooked, part.name).toMatch(new RegExp(`<[a-z]+ data-parity="${part.name}"`));
    }
    expect(new Set(PARITY_PARTS.map((p) => p.name)).size).toBe(PARITY_PARTS.length);
  });

  it("[PD-01] a missing anchor fails loudly", () => {
    expect(() => addParityHooks(original.replace('id="collectBtn"', 'id="gone"'))).toThrow(
      /molten-button/,
    );
  });

  it("[PD-01] the committed copy is the original with hooks and app fonts, nothing else (pnpm parity:reference)", () => {
    expect(copy).toBe(addParityHooks(withAppFonts(original)));
    expect(copy).not.toContain("fonts.googleapis.com");
  });

  it("[PD-05] tiles sharing an opening tag are hooked in order (Liquid choice tile, then Gold seal tile; box 1, then 2)", () => {
    const hooked = addParityHooks(original);
    const at = (name: string): number => hooked.indexOf(`data-parity="${name}"`);
    expect(at("liquid-choice-tile")).toBeLessThan(at("liquid-choice"));
    expect(at("liquid-choice")).toBeLessThan(at("seal-checkbox-tile"));
    expect(at("seal-checkbox-tile")).toBeLessThan(at("seal-checkbox"));
    expect(at("seal-checkbox")).toBeLessThan(at("seal-checkbox-on"));
    expect(hooked.slice(at("seal-checkbox-tile"), at("seal-checkbox"))).toContain(
      "Gold seal checkbox",
    );
  });

  it("[PD-05] a tolerance applies to its browser, or to every browser when it says all", () => {
    const base = PARITY_PARTS.find((p) => p.name === "tabs");
    if (!base) throw new Error("tabs part");
    const one = { ...base, tolerance: { browser: "webkit" as const, max: 0.03, why: "x" } };
    const all = { ...base, tolerance: { browser: "all" as const, max: 0.015, why: "x" } };
    expect(parityLimit(base, "webkit", 0.01)).toBe(0.01);
    expect(parityLimit(one, "webkit", 0.01)).toBe(0.03);
    expect(parityLimit(one, "chromium", 0.01)).toBe(0.01);
    expect(parityLimit(all, "chromium", 0.01)).toBe(0.015);
    expect(parityLimit(all, "webkit", 0.01)).toBe(0.015);
    // Never below the harness limit.
    expect(parityLimit(all, "webkit", 0.02)).toBe(0.02);
  });
});
