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
  };

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
});
