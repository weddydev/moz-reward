import { describe, expect, it } from "vitest";
import type { MemberId } from "@/lib/brand";
import {
  deriveMemberQrKeys,
  MEMBER_QR_LIFETIME_MS,
  MEMBER_QR_TOKEN_LENGTH,
  signMemberQr,
  verifyMemberQr,
} from "./member-qr";

const keys = deriveMemberQrKeys(Buffer.alloc(32, 7).toString("base64"));
const other = deriveMemberQrKeys(Buffer.alloc(32, 8).toString("base64"));
const id = "K7M2QX" as MemberId;
const now = Date.UTC(2026, 10, 26, 12, 0, 0);

/** The token's bytes after the "MQ1." prefix. */
const body = (t: string): Buffer => Buffer.from(t.slice(4), "base64url");
const rebuild = (b: Buffer): string => `MQ1.${b.toString("base64url")}`;

describe("[P1-14] member QR token (SECURITY §6)", () => {
  it("[P1-14] signs and verifies within 5 minutes", () => {
    const { token, expiresAt } = signMemberQr(id, now, keys);
    expect(token).toHaveLength(MEMBER_QR_TOKEN_LENGTH);
    expect(token).toMatch(/^MQ1\.[A-Za-z0-9_-]+$/);
    expect(expiresAt).toBe(now + MEMBER_QR_LIFETIME_MS);
    expect(verifyMemberQr(token, now + MEMBER_QR_LIFETIME_MS - 1000, keys)).toEqual({
      ok: true,
      memberId: id,
      expiresAt,
    });
  });

  it("[P1-14] rejects an expired token", () => {
    const { token } = signMemberQr(id, now, keys);
    expect(verifyMemberQr(token, now + MEMBER_QR_LIFETIME_MS, keys)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("[P1-14] never carries the raw member ID, and two tokens of one member differ", () => {
    const a = signMemberQr(id, now, keys).token;
    const b = signMemberQr(id, now, keys).token;
    expect(a).not.toBe(b);
    for (const t of [a, b]) {
      expect(t).not.toContain(id);
      expect(body(t).includes(Buffer.from(id, "ascii"))).toBe(false);
      for (let shift = 0; shift < 3; shift++) {
        const b64 = Buffer.from("x".repeat(shift) + id)
          .toString("base64url")
          .slice(4);
        expect(t).not.toContain(b64.slice(0, 6));
      }
    }
  });

  it("[P1-14] rejects every tampered byte as invalid (MAC checked before decrypting)", () => {
    const { token } = signMemberQr(id, now, keys);
    const raw = body(token);
    for (let i = 0; i < raw.length; i++) {
      const t = Buffer.from(raw);
      t[i] = (t[i] ?? 0) ^ 0x01;
      expect(verifyMemberQr(rebuild(t), now, keys), `byte ${i}`).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });

  it("[P1-14] rejects a wrong key, wrong prefix, wrong version, wrong length and junk", () => {
    const { token } = signMemberQr(id, now, keys);
    expect(verifyMemberQr(token, now, other)).toEqual({ ok: false, reason: "invalid" });
    const bad = [
      `MQ2.${token.slice(4)}`,
      token.slice(0, -1),
      `${token}A`,
      token.replace(/.$/, "+"),
      "",
      "ABC-123",
      id,
      "MQ1.",
      "x".repeat(10_000),
    ];
    for (const t of bad)
      expect(verifyMemberQr(t, now, keys), t.slice(0, 20)).toEqual({
        ok: false,
        reason: "invalid",
      });
    // A version byte other than 1, re-MACed with the right key, is still refused.
    const v2 = signMemberQr(id, now, keys, { version: 2 }).token;
    expect(verifyMemberQr(v2, now, keys)).toEqual({ ok: false, reason: "invalid" });
  });

  it("[P1-14] refuses a validly signed token whose expiry is beyond now + 5 min 30 s", () => {
    // Signed by a server 30 s ahead: expiry exactly now + 5 min 30 s is still accepted.
    const edge = signMemberQr(id, now + 30_000, keys).token;
    expect(verifyMemberQr(edge, now, keys).ok).toBe(true);
    const far = signMemberQr(id, now + 31_000, keys).token;
    expect(verifyMemberQr(far, now, keys)).toEqual({ ok: false, reason: "invalid" });
  });

  it("[P1-14] uses two separate subkeys, neither equal to the master", () => {
    const master = Buffer.alloc(32, 7);
    expect(keys.enc.equals(keys.mac)).toBe(false);
    expect(keys.enc.equals(master)).toBe(false);
    expect(keys.mac.equals(master)).toBe(false);
    expect(keys.enc).toHaveLength(32);
    expect(keys.mac).toHaveLength(32);
  });
});
