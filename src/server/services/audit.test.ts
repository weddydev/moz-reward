import { describe, expect, it } from "vitest";

import { keyIdOf } from "@/server/security/field-crypto";

import { scrubAuditMeta } from "./audit";

describe("[P1-04] audit meta scrubbing", () => {
  it("keeps data-key ids whole even when their hex is mostly digits (rotation audit, CI flake 18 Nov)", () => {
    // `kc011910373` was the key id in the failing run: its 9-digit tail matched the phone-number rule.
    const meta = {
      column: "phone_enc",
      rows: 2,
      fromKeyIds: ["k0123456789"],
      toKeyId: "kc011910373",
    };
    expect(scrubAuditMeta(meta)).toEqual(meta);
    const real = keyIdOf(Buffer.alloc(32, 7).toString("base64"));
    expect(scrubAuditMeta({ toKeyId: real })).toEqual({ toKeyId: real });
  });

  it("still scrubs phone numbers and emails in free text, and anything only resembling a key id", () => {
    expect(scrubAuditMeta({ note: "call 07400123456 or a@b.co" })).toEqual({
      note: "call [redacted] or [redacted]",
    });
    // Not the key-id shape (upper case, wrong length, extra text): the normal rules apply.
    expect(
      scrubAuditMeta({ a: "K0123456789", b: "k01234567890", c: "k0123456789 07400123456" }),
    ).toEqual({
      a: "K[redacted]",
      b: "k[redacted]",
      c: "k[redacted]",
    });
  });

  it("replaces values under sensitive keys whatever they look like", () => {
    expect(scrubAuditMeta({ phone: "k0123456789", token: "abc" })).toEqual({
      phone: "[redacted]",
      token: "[redacted]",
    });
  });
});
