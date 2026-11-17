import { describe, expect, it } from "vitest";
import { cleanPersonName, NAME_MAX, validBirthday } from "./profile-input";

describe("[P1-04] cleanPersonName", () => {
  it("trims, collapses inner whitespace and keeps ordinary names", () => {
    expect(cleanPersonName("  Aisha   Khan ")).toEqual({ ok: true, value: "Aisha Khan" });
    expect(cleanPersonName("Siân O'Brien-Jones")).toEqual({
      ok: true,
      value: "Siân O'Brien-Jones",
    });
    expect(cleanPersonName("محمد علي")).toEqual({ ok: true, value: "محمد علي" });
    expect(cleanPersonName("李小龍")).toEqual({ ok: true, value: "李小龍" });
  });

  it("normalises to NFC, so the same name is stored the same way however it was typed", () => {
    const decomposed = "Siân"; // "a" + combining circumflex
    const res = cleanPersonName(decomposed);
    expect(res).toEqual({ ok: true, value: "Siân" });
    expect(res.ok && res.value.length).toBe(4);
  });

  it.each([
    ["right-to-left override", "Ali\u202Ece"],
    ["left-to-right isolate", "Ali\u2066ce"],
    ["pop directional isolate", "Ali\u2069ce"],
    ["right-to-left mark", "Ali\u200Fce"],
    ["Arabic letter mark", "Ali\u061Cce"],
    ["zero-width space", "Ali\u200Bce"],
    ["zero-width joiner", "Ali\u200Dce"],
    ["word joiner", "Ali\u2060ce"],
    ["byte order mark", "\uFEFFAlice"],
    ["soft hyphen", "Ali\u00ADce"],
    ["control character", "Ali\u0007ce"],
    ["newline", "Alice\nSmith"],
  ])("refuses a name with a hidden character: %s", (_label, raw) => {
    expect(cleanPersonName(raw)).toEqual({
      ok: false,
      message: "Your name contains a hidden character. Please type it again.",
    });
  });

  it("refuses an empty name or one without any letter", () => {
    for (const raw of ["", "   ", "123", "--", "😀"]) {
      expect(cleanPersonName(raw)).toEqual({ ok: false, message: "Please enter your full name." });
    }
  });

  it(`allows ${String(NAME_MAX)} characters and refuses more (counted after cleaning)`, () => {
    const max = "A".repeat(NAME_MAX);
    expect(cleanPersonName(`  ${max}  `)).toEqual({ ok: true, value: max });
    expect(cleanPersonName(`${max}B`)).toEqual({
      ok: false,
      message: `Please keep your name to ${String(NAME_MAX)} characters.`,
    });
  });

  it("counts characters, not UTF-16 units (an astral letter is one)", () => {
    const astral = "𝒜".repeat(NAME_MAX); // U+1D49C, two UTF-16 units each
    expect(cleanPersonName(astral).ok).toBe(true);
  });
});

describe("[P1-04] validBirthday", () => {
  it("accepts real calendar days, including 29 February", () => {
    expect(validBirthday(1, 1)).toBe(true);
    expect(validBirthday(31, 12)).toBe(true);
    expect(validBirthday(29, 2)).toBe(true);
    expect(validBirthday(30, 4)).toBe(true);
  });

  it("refuses days a month never has and out-of-range values", () => {
    expect(validBirthday(30, 2)).toBe(false);
    expect(validBirthday(31, 4)).toBe(false);
    expect(validBirthday(31, 6)).toBe(false);
    expect(validBirthday(0, 5)).toBe(false);
    expect(validBirthday(32, 1)).toBe(false);
    expect(validBirthday(10, 0)).toBe(false);
    expect(validBirthday(10, 13)).toBe(false);
    expect(validBirthday(1.5, 3)).toBe(false);
  });
});
