import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

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
    expect(run).toThrow(/AUTH_SECRET/);
    expect(run).toThrow(/APP_ENV/);
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
    expect(() => parseServerEnv({ ...base, APP_URL: "https://mozrewards.co.uk" })).toThrow(/APP_ENV/);
    expect(() => parseServerEnv({ ...base, APP_ENV: "test", APP_URL: "https://staging.mozrewards.co.uk" })).toThrow(/APP_ENV/);
  });

  it("requires https on staging and production", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "production", APP_URL: "http://mozrewards.co.uk", EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k" })).toThrow(/APP_URL/);
    expect(parseServerEnv({ ...base, APP_ENV: "production", APP_URL: "https://mozrewards.co.uk", EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k" }).APP_ENV).toBe("production");
  });

  it("requires provider credentials for the chosen email provider", () => {
    expect(() => parseServerEnv({ ...base, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
    expect(() => parseServerEnv({ ...base, EMAIL_PROVIDER: "resend" })).toThrow(/EMAIL_API_KEY/);
  });
});
