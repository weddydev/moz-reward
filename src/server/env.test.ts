import { describe, expect, it } from "vitest";
import { parseServerEnv, serverEnvSchema } from "./env";

const base = {
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  REDIS_URL: "redis://:p@localhost:6379",
  AUTH_SECRET: "x".repeat(32),
  EMAIL_PROVIDER: "smtp",
  EMAIL_FROM: "Moz Rewards <hello@example.co.uk>",
  SMTP_HOST: "localhost",
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  BLIND_INDEX_KEY: Buffer.alloc(32, 2).toString("base64"),
  MEMBER_QR_SIGNING_KEY: Buffer.alloc(32, 3).toString("base64"),
};

describe("[P0-02] server env", () => {
  it("accepts a valid local environment", () => {
    expect(parseServerEnv(base).APP_ENV).toBe("local");
  });

  it("names missing variables without printing any values", () => {
    const { AUTH_SECRET: _secret, APP_ENV: _env, ...rest } = base;
    const run = () => parseServerEnv(rest);
    expect(run).toThrow(/- AUTH_SECRET: missing \(required\)/);
    expect(run).toThrow(/- APP_ENV: missing \(required\)/);
    // Present but wrong is reported as invalid, not missing.
    expect(() => parseServerEnv({ ...base, AUTH_SECRET: "short" })).toThrow(
      /- AUTH_SECRET: must be at least 32 characters/,
    );
    try {
      run();
    } catch (e) {
      expect(String(e)).not.toContain("postgres://u:p@");
    }
  });

  it("rejects a malformed URL", () => {
    expect(() => parseServerEnv({ ...base, APP_URL: "not a url" })).toThrow(/APP_URL/);
  });

  it("rejects a malformed or wrong-protocol database/Redis URL at startup, without echoing it", () => {
    const bad = [
      ["DATABASE_URL", "not-a-url"],
      ["DATABASE_URL", "mysql://u:secretpw@localhost/db"],
      ["DATABASE_URL_MIGRATIONS", "http://u:secretpw@localhost/db"],
      ["DATABASE_URL_TEST", "nonsense"],
      ["REDIS_URL", "localhost:6379"],
      ["REDIS_URL", "http://:secretpw@localhost:6379"],
      ["REDIS_URL_TEST", "nonsense"],
    ] as const;
    for (const [name, value] of bad) {
      const run = () => parseServerEnv({ ...base, [name]: value });
      expect(run, `${name}=${value}`).toThrow(new RegExp(`- ${name}: `));
      expect(run).not.toThrow(/secretpw/);
    }
  });

  it("accepts postgres:, postgresql:, redis: and rediss: URLs", () => {
    expect(() =>
      parseServerEnv({
        ...base,
        DATABASE_URL: "postgresql://u:p@db.example:5432/db?sslmode=require",
        REDIS_URL: "rediss://default:p@cache.example:6380",
      }),
    ).not.toThrow();
  });

  it("refuses local/test settings on a non-localhost URL (fails closed on a misconfigured deploy)", () => {
    expect(() => parseServerEnv({ ...base, APP_URL: "https://mozrewards.co.uk" })).toThrow(
      /APP_ENV/,
    );
    expect(() =>
      parseServerEnv({ ...base, APP_ENV: "test", APP_URL: "https://staging.mozrewards.co.uk" }),
    ).toThrow(/APP_ENV/);
  });

  const prod = {
    ...base,
    NODE_ENV: "production",
    APP_ENV: "production",
    APP_URL: "https://mozrewards.co.uk",
    EMAIL_PROVIDER: "resend",
    EMAIL_API_KEY: "k",
    EMAIL_FALLBACK_PROVIDER: "brevo",
    EMAIL_FALLBACK_API_KEY: "k2",
    TURNSTILE_SECRET_KEY: "0x4AAAAAAA-test-only-secret",
    TRUSTED_PROXY: "cloudflare",
    REDIS_URL: "rediss://:strong-password@redis.internal:6380",
    REDIS_KEY_PREFIX: "prod:",
  };

  it("[P0-05] refuses TRUSTED_PROXY=none on staging/production (client IPs would all share one bucket)", () => {
    expect(() => parseServerEnv({ ...prod, TRUSTED_PROXY: "none" })).toThrow(/TRUSTED_PROXY/);
    expect(() => parseServerEnv({ ...prod, APP_ENV: "staging", TRUSTED_PROXY: "none" })).toThrow(
      /TRUSTED_PROXY/,
    );
    expect(parseServerEnv({ ...prod, TRUSTED_PROXY: "caddy" }).TRUSTED_PROXY).toBe("caddy");
    expect(parseServerEnv(base).TRUSTED_PROXY).toBe("none");
  });

  it("requires https on staging and production", () => {
    expect(() => parseServerEnv({ ...prod, APP_URL: "http://mozrewards.co.uk" })).toThrow(
      /APP_URL/,
    );
    expect(parseServerEnv(prod).APP_ENV).toBe("production");
  });

  it("refuses staging/production on a development build (NODE_ENV cross-check)", () => {
    expect(() => parseServerEnv({ ...prod, NODE_ENV: "development" })).toThrow(/NODE_ENV/);
    expect(() => parseServerEnv({ ...prod, NODE_ENV: undefined })).toThrow(/NODE_ENV/);
    expect(() =>
      parseServerEnv({
        ...prod,
        APP_ENV: "staging",
        APP_URL: "https://staging.mozrewards.co.uk",
        NODE_ENV: "development",
      }),
    ).toThrow(/NODE_ENV/);
    // A local production build (e.g. E2E against `next start`) stays allowed.
    expect(parseServerEnv({ ...base, NODE_ENV: "production", APP_ENV: "test" }).APP_ENV).toBe(
      "test",
    );
  });

  it("[P0-19] boot fails when two secrets are equal, naming the variables but not the value", () => {
    const shared = Buffer.alloc(32, 9).toString("base64");
    const run = () =>
      parseServerEnv({ ...base, BLIND_INDEX_KEY: shared, MEMBER_QR_SIGNING_KEY: shared });
    expect(run).toThrow(/MEMBER_QR_SIGNING_KEY: must differ from BLIND_INDEX_KEY/);
    expect(run).not.toThrow(new RegExp(shared.replace(/[+/=]/g, "\\$&")));
    expect(() => parseServerEnv({ ...base, DATA_ENCRYPTION_KEY: base.AUTH_SECRET })).toThrow();
  });

  it("[P0-19] staging/production require a Turnstile secret and refuse SMTP for sign-in mail", () => {
    const { TURNSTILE_SECRET_KEY: _t, ...noTurnstile } = prod;
    expect(() => parseServerEnv(noTurnstile)).toThrow(/TURNSTILE_SECRET_KEY: required/);
    expect(() =>
      parseServerEnv({ ...prod, EMAIL_FALLBACK_PROVIDER: "smtp", SMTP_HOST: "smtp.example" }),
    ).toThrow(/EMAIL_FALLBACK_PROVIDER: smtp is for local\/test only/);
    expect(() =>
      parseServerEnv({ ...prod, EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example" }),
    ).toThrow(/EMAIL_PROVIDER: smtp is for local\/test only/);
    // Local keeps Mailpit over plain SMTP, without Turnstile.
    expect(parseServerEnv(base).EMAIL_PROVIDER).toBe("smtp");
  });

  it("[P0-19] requires a different, configured fallback email provider on staging/production", () => {
    const { EMAIL_FALLBACK_PROVIDER: _p, EMAIL_FALLBACK_API_KEY: _k, ...noFallback } = prod;
    expect(() => parseServerEnv(noFallback)).toThrow(/EMAIL_FALLBACK_PROVIDER: required/);
    expect(() => parseServerEnv({ ...prod, EMAIL_FALLBACK_PROVIDER: "resend" })).toThrow(
      /EMAIL_FALLBACK_PROVIDER: must differ/,
    );
    expect(() => parseServerEnv({ ...prod, EMAIL_FALLBACK_API_KEY: "" })).toThrow(
      /EMAIL_FALLBACK_API_KEY/,
    );
    expect(parseServerEnv(prod).EMAIL_FALLBACK_PROVIDER).toBe("brevo");
    // Local/test may run without one (Mailpit only).
    expect(parseServerEnv(base).EMAIL_FALLBACK_PROVIDER).toBeUndefined();
  });

  it("requires provider credentials for the chosen email provider", () => {
    expect(() => parseServerEnv({ ...base, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
    expect(() => parseServerEnv({ ...base, EMAIL_PROVIDER: "resend" })).toThrow(/EMAIL_API_KEY/);
  });

  it("names an invalid enum value and a too-short secret without echoing either value", () => {
    const run = (): unknown =>
      parseServerEnv({
        ...base,
        APP_ENV: "prodution-typo-value",
        AUTH_SECRET: "short-secret-value",
      });
    expect(run).toThrow(/APP_ENV/);
    expect(run).toThrow(/AUTH_SECRET/);
    expect(run).not.toThrow(/prodution-typo-value|short-secret-value/);
  });

  it("treats a blank optional variable as unset (copied .env.example lines are empty)", () => {
    expect(parseServerEnv({ ...base, GOOGLE_CLIENT_ID: "" }).GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("never declares browser variables: NEXT_PUBLIC_* belong to clientEnv in @/lib/env", () => {
    for (const name of Object.keys(serverEnvSchema.shape))
      expect(name).not.toMatch(/^NEXT_PUBLIC_/);
  });

  it("[P0-19] requires each crypto key as base64 of exactly 32 bytes (SEC-L3), never echoing it", () => {
    for (const name of [
      "DATA_ENCRYPTION_KEY",
      "BLIND_INDEX_KEY",
      "MEMBER_QR_SIGNING_KEY",
    ] as const) {
      const { [name]: _key, ...rest } = base;
      expect(() => parseServerEnv(rest)).toThrow(new RegExp(`- ${name}: missing \\(required\\)`));
      const short = Buffer.alloc(16, 9).toString("base64");
      expect(() => parseServerEnv({ ...base, [name]: short })).toThrow(
        new RegExp(`- ${name}: must be base64 of exactly 32 bytes`),
      );
      expect(() => parseServerEnv({ ...base, [name]: "not base64 at all!!" })).toThrow(
        new RegExp(name),
      );
      try {
        parseServerEnv({ ...base, [name]: short });
      } catch (e) {
        expect(String(e)).not.toContain(short);
      }
    }
  });

  it("[P0-19] staging/production need Redis over TLS with a password and a key prefix (SEC-M3)", () => {
    expect(parseServerEnv(prod).REDIS_KEY_PREFIX).toBe("prod:");
    expect(() => parseServerEnv({ ...prod, REDIS_URL: "redis://:pw@redis.internal:6379" })).toThrow(
      /- REDIS_URL: must use rediss:\/\/ \(TLS\) outside local\/test/,
    );
    expect(() => parseServerEnv({ ...prod, REDIS_URL: "rediss://redis.internal:6380" })).toThrow(
      /- REDIS_URL: must include a password outside local\/test/,
    );
    expect(() => parseServerEnv({ ...prod, REDIS_KEY_PREFIX: "" })).toThrow(
      /- REDIS_KEY_PREFIX: required outside local\/test/,
    );
    // Local keeps the plain dev Redis.
    expect(parseServerEnv(base).REDIS_URL).toBe("redis://:p@localhost:6379");
  });
});
