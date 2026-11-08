import { describe, expect, it } from "vitest";
import { REDACTED, redact, redactText } from "./redact";

describe("[P0-04] dead-letter payload redaction", () => {
  it("removes personal data and secrets by key, keeping ids and shape", () => {
    const payload = {
      userId: "u-1",
      shopId: "s-1",
      email: "jo@example.co.uk",
      phoneNumber: "07700900123",
      fullName: "Jo Bloggs",
      redeemCode: "K7Q42M",
      resetToken: "abc",
      apiKey: "sk_live",
      nested: { postcode: "NW1 8AB", status: "pending", amountPence: 450 },
    };
    expect(redact(payload)).toEqual({
      userId: "u-1",
      shopId: "s-1",
      email: REDACTED,
      phoneNumber: REDACTED,
      fullName: REDACTED,
      redeemCode: REDACTED,
      resetToken: REDACTED,
      apiKey: REDACTED,
      nested: { postcode: REDACTED, status: "pending", amountPence: 450 },
    });
  });

  it("scrubs emails and long digit runs hidden in free-text values", () => {
    expect(redactText("send to jo@example.co.uk or 07700900123 now")).toBe(
      `send to ${REDACTED} or ${REDACTED} now`,
    );
  });

  it("bounds size: long strings, big arrays and deep nesting", () => {
    expect((redact("x".repeat(500)) as string).length).toBeLessThanOrEqual(201);
    const arr = redact(Array.from({ length: 60 }, (_, i) => i)) as unknown[];
    expect(arr).toHaveLength(51);
    expect(arr.at(-1)).toBe("[+10 more]");
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });

  it("passes through numbers, booleans and null", () => {
    expect(redact({ count: 3, ok: true, at: null })).toEqual({ count: 3, ok: true, at: null });
  });
});
