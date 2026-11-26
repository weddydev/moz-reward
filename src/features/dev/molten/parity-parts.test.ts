import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addParityHooks,
  PARITY_PARTS,
  parityLimit,
  REFERENCE_FIXES,
  withAppFonts,
  withFxProbe,
  withReferenceFixes,
} from "./parity-parts";

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

  it("[PD-01] the committed copy is the original with hooks, app fonts and the listed fixes, nothing else (pnpm parity:reference)", () => {
    expect(copy).toBe(addParityHooks(withFxProbe(withReferenceFixes(withAppFonts(original)))));
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

  it("[PD-06] reference fixes: the phone's .back rule no longer reaches the member card's back face; a stale fix fails loudly", () => {
    const fixed = withReferenceFixes(original);
    for (const fix of REFERENCE_FIXES) {
      expect(fixed).toContain(fix.to);
      // Nothing of the original text is left outside its fix (a fix may keep it, after what it adds).
      expect(fixed.split(fix.from).length - 1, fix.why).toBe(fix.to.split(fix.from).length - 1);
    }
    // The card's own back-face rule is untouched; only the phone's button rule is scoped.
    expect(fixed).toContain(".mface.back{transform:rotateY(180deg)");
    expect(fixed).toContain('class="mface back"');
    expect(() => withReferenceFixes(original.replace(".back{position:absolute", ".bk{"))).toThrow(
      /leaks onto the member card/,
    );
  });

  it("[PD-06] reference fixes: the card's face turned away is hidden, swapping with the turn, as in the app (WebKit draws the card flat)", () => {
    const fixed = withReferenceFixes(original);
    expect(fixed).toContain(".mface{transition:visibility .7s linear(0,0 9.6%,1 9.6%,1)}");
    // Keyed on the reference's own labels for each side (its flip sets them).
    expect(original).toContain('aria-label="Member card. Press to show QR code"');
    expect(original).toContain("'Member card showing QR code. Press to turn back'");
    expect(fixed).toContain(
      '.mcard[aria-label^="Member card."] .mface.back,.mcard[aria-label^="Member card showing"] .mface.front{visibility:hidden}',
    );
    expect(() =>
      withReferenceFixes(
        original.replace(".mface.back{transform:rotateY(180deg);", ".mface.back{"),
      ),
    ).toThrow(/draws the card flat/);
  });
});
