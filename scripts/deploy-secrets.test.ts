import { describe, expect, it } from "vitest";
import { generate, missingSecrets, specsFor } from "./deploy-secrets.mjs";

/** P0-15 step C: per-environment generated secrets (SECURITY §7 inventory), set in GitHub without display. */
describe("[P0-15] deploy secrets generator", () => {
  it("staging gets the app keys, the owner password and the basic-auth password; never Umami", () => {
    const names = specsFor("staging").map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "AUTH_SECRET_STAGING",
        "DATA_ENCRYPTION_KEY_STAGING",
        "BLIND_INDEX_KEY_STAGING",
        "MEMBER_QR_SIGNING_KEY_STAGING",
        "HEALTH_TOKEN_STAGING",
        "DB_OWNER_PASSWORD_STAGING",
        "BASIC_AUTH_PASSWORD_STAGING",
      ]),
    );
    expect(names.some((n) => n.startsWith("UMAMI"))).toBe(false);
  });

  it("production gets Umami's secret and no basic-auth password", () => {
    const names = specsFor("production").map((s) => s.name);
    expect(names).toContain("UMAMI_APP_SECRET_PRODUCTION");
    expect(names).not.toContain("BASIC_AUTH_PASSWORD_PRODUCTION");
    expect(() => specsFor("dev")).toThrow(/environment/);
  });

  it("generated values have the formats the app and the root helper accept", () => {
    const byName = Object.fromEntries(specsFor("staging").map((s) => [s.name, generate(s)]));
    expect(Buffer.from(byName.AUTH_SECRET_STAGING ?? "", "base64")).toHaveLength(48);
    for (const k of ["DATA_ENCRYPTION_KEY", "BLIND_INDEX_KEY", "MEMBER_QR_SIGNING_KEY"]) {
      const v = byName[`${k}_STAGING`] ?? "";
      expect(v).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(Buffer.from(v, "base64")).toHaveLength(32);
    }
    expect((byName.HEALTH_TOKEN_STAGING ?? "").length).toBeGreaterThanOrEqual(32);
    // moz-deploy read_owner_password: 24-128 URL-safe characters.
    expect(byName.DB_OWNER_PASSWORD_STAGING).toMatch(/^[A-Za-z0-9._~-]{24,128}$/);
    // Basic auth goes through a netrc file in the smoke step: no spaces or quotes.
    expect(byName.BASIC_AUTH_PASSWORD_STAGING).toMatch(/^[A-Za-z0-9_-]{24,}$/);
  });

  it("two generations never repeat a value, and keys of one environment differ from each other", () => {
    const a = specsFor("staging").map(generate);
    const b = specsFor("staging").map(generate);
    expect(new Set([...a, ...b]).size).toBe(a.length * 2);
  });

  it("only missing secrets are created (an existing one is never overwritten)", () => {
    const missing = missingSecrets("staging", ["AUTH_SECRET_STAGING", "EMAIL_API_KEY_STAGING"]);
    expect(missing.map((s) => s.name)).not.toContain("AUTH_SECRET_STAGING");
    expect(missing.map((s) => s.name)).toContain("BLIND_INDEX_KEY_STAGING");
    expect(
      missingSecrets(
        "staging",
        specsFor("staging").map((s) => s.name),
      ),
    ).toEqual([]);
  });
});
