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

/**
 * The E2E database as one of the RLS roles (P0-20), with the password from the developer's matching
 * DATABASE_URL* when it names that role (`.env.example` defaults), else role:role. Same rule as
 * tests/support/db.ts roleUrl (kept separate: this file can't import server code).
 */
function e2eRoleUrl(role: "moz_app" | "moz_auth" | "moz_worker", envName: string): string {
  const u = new URL(e2eDbUrl());
  const configured = process.env[envName];
  const fromEnv = configured ? new URL(configured) : null;
  u.username = role;
  u.password =
    fromEnv && decodeURIComponent(fromEnv.username) === role
      ? decodeURIComponent(fromEnv.password)
      : role;
  return u.toString();
}

/** Environment for the E2E server *and* the Playwright process (specs use factories against the same DB). */
export function e2eServerEnv(): Record<string, string> {
  const db = e2eDbUrl();
  return {
    APP_ENV: "test",
    APP_URL: `http://localhost:${E2E_PORT}`,
    // The server runs as the RLS roles, like staging; factories (test API, specs) use the owner URL.
    DATABASE_URL: e2eRoleUrl("moz_app", "DATABASE_URL"),
    DATABASE_URL_AUTH: e2eRoleUrl("moz_auth", "DATABASE_URL_AUTH"),
    DATABASE_URL_WORKER: e2eRoleUrl("moz_worker", "DATABASE_URL_WORKER"),
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
