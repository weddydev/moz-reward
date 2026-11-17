import { describe, expect, it } from "vitest";
import { errorSummary, REDACTED, redact, redactText } from "./redact";

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

describe("[P1-04] redactText keeps UUIDs whole (audit meta ids)", () => {
  it("never touches a UUID, even one with a long run of digits, but still scrubs a phone beside it", () => {
    // P1-04: a shop id like …-c8ef1566567c lost "1566567" in an audit row (about 1 random UUID in 10).
    const ids = [
      "01a1e9cb-05f0-7459-872d-c8ef1566567c",
      "a0f26d5a-8e59-4944-949f-123456789012",
      "01234567-8901-4234-8567-890123456789",
    ];
    for (const id of ids) expect(redactText(id)).toBe(id);
    const mixed = redactText(`shop ${ids[0] ?? ""} called 07700900123 / +44 7700 900123`);
    expect(mixed).toContain(ids[0]);
    expect(mixed).not.toMatch(/07700900123|7700 900123/);
    // Digits running on past a UUID-shaped prefix are not a UUID: still scrubbed.
    expect(redactText("a0f26d5a-8e59-4944-949f-1234567890123456")).not.toContain(
      "1234567890123456",
    );
  });
});

describe("[P1-04] errorSummary: one log line without row values (P1-A batch, security review L3)", () => {
  /** What drizzle throws for a failed query: its own error wrapping the pg error. */
  function pgFailure(): Error {
    const pg = Object.assign(new Error('new row violates check constraint "x"'), {
      name: "error",
      code: "23514",
      detail: "Failing row contains (Aisha Khan, +447400123456, aisha@example.com).",
      table: "customer_profiles",
    });
    return new Error(
      'Failed query: update "customer_profiles" set "phone_enc" = $1 params: v1.secret',
      {
        cause: pg,
      },
    );
  }

  it("keeps name, code and the message, never the pg detail, params or row values", () => {
    const line = errorSummary(pgFailure());
    expect(line).toContain("23514");
    expect(line).toContain("violates check constraint");
    for (const leak of ["Aisha", "447400123456", "aisha@example.com", "Failing row", "v1.secret"])
      expect(line).not.toContain(leak);
  });

  it("redacts emails and phone numbers inside a message, and handles non-errors", () => {
    const line = errorSummary(new Error("no user aisha@example.com at 07400 123456"));
    expect(line).not.toContain("aisha@example.com");
    expect(line).not.toContain("07400 123456");
    expect(errorSummary("boom")).toBe("non-error thrown");
    expect(errorSummary(undefined)).toBe("non-error thrown");
  });

  it("drops the value a data-exception (SQLSTATE 22…) quotes, and any URL or connection string", () => {
    const bad = Object.assign(new Error('invalid input syntax for type uuid: "Aisha Khan"'), {
      code: "22P02",
    });
    const line = errorSummary(bad);
    expect(line).toContain("22P02");
    expect(line).toContain("invalid input syntax for type uuid");
    expect(line).not.toContain("Aisha");
    const conn = errorSummary(
      new Error("connect failed: postgres://moz:hunter2@localhost:5432/moz"),
    );
    expect(conn).not.toContain("hunter2");
    expect(conn).toContain("connect failed");
  });

  it("stops at a cause cycle", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.assign(a, { cause: b });
    expect(errorSummary(a)).toMatch(/^Error: a ← Error: b$/);
  });
});
