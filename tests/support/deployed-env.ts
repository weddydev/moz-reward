import { vi } from "vitest";

/**
 * Unit tests only: stubs a valid staging/production server environment on top of the local one, so a test
 * can exercise deployed-only branches. Keep in step with the staging/production rules in src/server/env.ts (P0-19).
 */
export function stubDeployedEnv(appEnv: "staging" | "production"): void {
  vi.stubEnv("NODE_ENV", "production"); // deployed environments run a production build (env cross-check)
  vi.stubEnv("APP_ENV", appEnv);
  vi.stubEnv(
    "APP_URL",
    appEnv === "production" ? "https://mozrewards.co.uk" : "https://staging.mozrewards.co.uk",
  );
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("EMAIL_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FALLBACK_PROVIDER", "brevo");
  vi.stubEnv("EMAIL_FALLBACK_API_KEY", "xkeysib_test_key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAA-test-only-secret");
  vi.stubEnv("ALERT_EMAILS", "dev-a@test.moz.invalid,dev-b@test.moz.invalid");
  vi.stubEnv("TRUSTED_PROXY", appEnv === "production" ? "cloudflare" : "caddy");
  vi.stubEnv("REDIS_URL", "rediss://:test-only@redis.invalid:6380");
  vi.stubEnv("REDIS_CACHE_URL", "rediss://:test-only@redis-cache.invalid:6380");
  vi.stubEnv("REDIS_KEY_PREFIX", `${appEnv}:`);
}
