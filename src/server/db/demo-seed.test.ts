import { Secret, TOTP } from "otpauth";
import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNTS,
  DEMO_SHOPS,
  demoCredentials,
  demoEmail,
  demoEmailBase,
  totpCode,
  totpUri,
} from "./demo-seed";

const key = Buffer.alloc(32, 7);
const BASE = "demo@mozrewards.test";
const CODE = /^[2-9A-HJKMNP-TV-Z]{6}$/;

describe("[P0-16] demo dataset plan", () => {
  it("has the three demo shops of TESTING §6 with valid, distinct codes, slugs and ids", () => {
    expect(DEMO_SHOPS.map((s) => `${s.name} — ${s.town}`)).toEqual([
      "Brew & Bloom Café — Camden",
      "Patel's Corner Store — Leicester",
      "Glow Studio — Manchester",
    ]);
    for (const shop of DEMO_SHOPS) expect(shop.shopCode).toMatch(CODE);
    for (const field of ["id", "slug", "shopCode"] as const) {
      expect(new Set(DEMO_SHOPS.map((s) => s[field])).size).toBe(3);
    }
  });

  it("has exactly one account per role", () => {
    expect(DEMO_ACCOUNTS.map((a) => a.key)).toEqual([
      "customer",
      "staff",
      "owner",
      "admin-owner",
      "admin-support",
      "admin-moderator",
      "admin-finance",
    ]);
    expect(new Set(DEMO_ACCOUNTS.map((a) => a.id)).size).toBe(DEMO_ACCOUNTS.length);
    expect(DEMO_ACCOUNTS.find((a) => a.key === "customer")?.memberId).toMatch(CODE);
  });
});

describe("[P0-16] demo email addresses", () => {
  it("plus-addresses one inbox per account, lower-case", () => {
    expect(demoEmail("Dev.Team@Example.co.uk", "admin-owner")).toBe(
      "dev.team+moz-admin-owner@example.co.uk",
    );
  });

  it("uses a local default that only Mailpit can receive", () => {
    expect(demoEmailBase("local", undefined)).toBe(BASE);
    expect(demoEmailBase("test", undefined)).toBe(BASE);
  });

  it("staging needs a real inbox: refuses to seed without DEMO_EMAIL_BASE", () => {
    expect(() => demoEmailBase("staging", undefined)).toThrow(/DEMO_EMAIL_BASE/);
    expect(demoEmailBase("staging", "team@example.co.uk")).toBe("team@example.co.uk");
  });

  it.each(["not-an-email", "a@b@c.com", "has+plus@example.com", ""])(
    "refuses the base %j",
    (bad) => {
      expect(() => demoEmailBase("local", bad)).toThrow(/DEMO_EMAIL_BASE/);
    },
  );
});

describe("[P0-16] demo credentials are derived, never stored or committed", () => {
  const creds = demoCredentials(key, BASE);

  it("gives the same credentials every time for the same key (a reset keeps authenticator apps working)", () => {
    expect(demoCredentials(key, BASE)).toEqual(creds);
  });

  it("changes every secret with the environment's key", () => {
    const other = demoCredentials(Buffer.alloc(32, 8), BASE);
    for (const [i, c] of creds.entries()) {
      if (c.password === null) continue;
      expect(other[i]?.password).not.toBe(c.password);
      expect(other[i]?.totpSecret).not.toBe(c.totpSecret);
    }
  });

  it("the customer has no password or TOTP (email link / Google only)", () => {
    expect(creds.find((c) => c.key === "customer")).toMatchObject({
      password: null,
      totpSecret: null,
    });
  });

  it("every staff and admin account has its own long password and its own TOTP secret", () => {
    const privileged = creds.filter((c) => c.key !== "customer");
    expect(privileged).toHaveLength(6);
    const secrets = privileged.flatMap((c) => [c.password, c.totpSecret]);
    for (const s of secrets) expect(s?.length).toBeGreaterThanOrEqual(24);
    expect(new Set(secrets).size).toBe(12);
  });
});

describe("[P0-16] TOTP helper (RFC 6238, as Better Auth verifies it)", () => {
  // 32 characters, like Better Auth's generated TOTP secrets (built, not a literal: not a real credential).
  const secret = Array.from({ length: 32 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
  const at = Date.UTC(2026, 10, 10, 9, 0, 7);

  it("matches an independent implementation, 6 digits / 30 s / SHA-1", () => {
    const reference = new TOTP({ secret: Secret.fromUTF8(secret), digits: 6, period: 30 });
    expect(totpCode(secret, at)).toBe(reference.generate({ timestamp: at }));
    expect(totpCode(secret, at)).toMatch(/^\d{6}$/);
    expect(totpCode(secret, at + 30_000)).not.toBe(totpCode(secret, at));
  });

  it("builds an otpauth URI an authenticator app can import", () => {
    const uri = totpUri(secret, "demo+moz-owner@mozrewards.test");
    const parsed = new URL(uri);
    expect(parsed.protocol).toBe("otpauth:");
    expect(parsed.searchParams.get("issuer")).toBe("Moz Rewards");
    const fromUri = new TOTP({
      secret: Secret.fromBase32(parsed.searchParams.get("secret") ?? ""),
      digits: 6,
      period: 30,
    });
    expect(fromUri.generate({ timestamp: at })).toBe(totpCode(secret, at));
  });
});
