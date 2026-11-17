import { describe, expect, it } from "vitest";
import { maskPhone, parseUkMobile, phoneBlindIndexWith } from "./phone";

describe("[P1-04] UK mobile numbers (stored E.164)", () => {
  it.each([
    ["07400 123456", "+447400123456"],
    ["07400123456", "+447400123456"],
    ["+44 7400 123456", "+447400123456"],
    ["+44 (0)7400 123456", "+447400123456"],
    ["0044 7400 123456", "+447400123456"],
    ["  07400-123-456 ", "+447400123456"],
    // Crown Dependencies share +44 07 numbering (Guernsey, Isle of Man): accepted (DECISIONS 17 Nov).
    ["07781 123456", "+447781123456"],
    ["07624 123456", "+447624123456"],
  ])("accepts %s as %s", (input, e164) => {
    expect(parseUkMobile(input)).toEqual({ ok: true, e164 });
  });

  it.each([
    ["020 7123 4567", "landline"],
    ["+33 6 12 34 56 78", "French mobile"],
    ["+1 415 555 2671", "US number"],
    ["0740012345", "too short"],
    ["074001234567", "too long"],
    ["", "empty"],
    ["not a number", "letters"],
    ["0800 123 4567", "freephone"],
    ["07400 123456 ext. 2", "extension"],
    ["7".repeat(40), "absurdly long"],
  ])("rejects %s (%s) with the UK-only message", (input) => {
    expect(parseUkMobile(input)).toEqual({ ok: false, reason: "not-uk-mobile" });
  });

  it("masks all but the last three digits", () => {
    expect(maskPhone("+447400123456")).toBe("07••• •••456");
  });

  it("the blind index is stable for the same number and differs per number and per key", () => {
    const k = Buffer.alloc(32, 3);
    const a = phoneBlindIndexWith(k, "+447400123456");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(phoneBlindIndexWith(k, "+447400123456")).toBe(a);
    expect(phoneBlindIndexWith(k, "+447400123457")).not.toBe(a);
    expect(phoneBlindIndexWith(Buffer.alloc(32, 4), "+447400123456")).not.toBe(a);
  });
});
