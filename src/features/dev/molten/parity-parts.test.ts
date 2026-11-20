import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addParityHooks, PARITY_PARTS, withAppFonts } from "./parity-parts";

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
});
