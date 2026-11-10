/**
 * Loaded by playwright.config (compiled as CommonJS), so it must not import server or migration code.
 * The E2E server runs beside `pnpm dev` (3000) on its own port, build folder and database.
 */
export const E2E_PORT = 3100;

/** `<DATABASE_URL_TEST db>_e2e`, e.g. moz_test_e2e (same naming as tests/support/db.ts e2eDbName). */
export function e2eDbUrl(): string {
  const base = process.env.DATABASE_URL_TEST;
  if (!base) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  const u = new URL(base);
  u.pathname = `${u.pathname}_e2e`;
  return u.toString();
}

/** Environment for the E2E server *and* the Playwright process (specs use factories against the same DB). */
export function e2eServerEnv(): Record<string, string> {
  const db = e2eDbUrl();
  return {
    APP_ENV: "test",
    APP_URL: `http://localhost:${E2E_PORT}`,
    DATABASE_URL: db,
    DATABASE_URL_MIGRATIONS: db,
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: process.env.SMTP_HOST ?? "localhost",
    REDIS_KEY_PREFIX: "e2e:",
    // As behind Caddy: the client IP is the right-most X-Forwarded-For hop, which every test sets to its own
    // address (support/test.ts), so per-IP limits run as on staging instead of being skipped for "local".
    TRUSTED_PROXY: "caddy",
    NEXT_DIST_DIR: ".next-e2e",
  };
}
