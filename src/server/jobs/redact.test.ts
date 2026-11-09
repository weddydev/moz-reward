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

  it("allowlist: strings under keys not known to be ids/enums are redacted, whatever the key says", () => {
    expect(
      redact({
        to: "07700 900123",
        recipient: "Jo Bloggs",
        url: "https://moz.example/verify?token=Zx81kQ",
        args: ["+44 7700 900 123", "u-1"],
        memberId: "MZ-4821-7730",
        sessionId: "sess_abc",
        deviceId: "dev-1",
        userIds: ["u-1", "u-2"],
        status: "pending",
        kind: "points.approved",
      }),
    ).toEqual({
      to: REDACTED,
      recipient: REDACTED,
      url: REDACTED,
      args: [REDACTED, REDACTED],
      memberId: REDACTED,
      sessionId: REDACTED,
      deviceId: REDACTED,
      userIds: ["u-1", "u-2"],
      status: "pending",
      kind: "points.approved",
    });
  });

  it("an id-shaped key with a non-id value (spaces, @, very long) is still redacted", () => {
    expect(
      redact({ userId: "jo@example.co.uk", shopId: "Brew and Bloom", id: "x".repeat(80) }),
    ).toEqual({ userId: REDACTED, shopId: REDACTED, id: REDACTED });
  });

  it("scrubs spaced phone numbers, URL query values and bearer tokens in free text, keeps dates", () => {
    expect(
      redactText(
        "SMS to +44 7700 900123 failed for https://x.test/verify?token=AbC123&next=/wallet at 2026-11-09 (Bearer eyJhbGciOi.x.y)",
      ),
    ).toBe(
      `SMS to ${REDACTED} failed for https://x.test/verify?token=${REDACTED}&next=${REDACTED} at 2026-11-09 (Bearer ${REDACTED})`,
    );
    expect(redactText("call 07700 900 123 or (020) 7946 0958")).toBe(
      `call ${REDACTED} or ${REDACTED}`,
    );
  });

  it("passes through numbers, booleans and null", () => {
    expect(redact({ count: 3, ok: true, at: null })).toEqual({ count: 3, ok: true, at: null });
  });
});
