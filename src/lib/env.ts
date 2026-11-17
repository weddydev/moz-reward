/**
 * Browser-safe environment (P0-02): `NEXT_PUBLIC_*` variables only. Server variables live in `@/server/env`
 * (server-only), so this module can be imported from client components without pulling server names into the
 * bundle. Each value is read with a literal `process.env.NEXT_PUBLIC_…` so Next inlines it at build time.
 * P1-02: no validation library here. The root layout and `instrumentation-client` import this module, so zod
 * cost ~31 KB gzip on every page (Lighthouse); the five rules below are written out instead. Keep it import-free.
 */

export const CLIENT_ENV_NAMES = [
  /** Cloudflare Turnstile site key (public by design; the secret stays server-side). */
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  /** Web Push VAPID public key (the browser needs it to subscribe; the private key stays server-side). */
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  /**
   * P0-13: Umami analytics, same origin under this path (Caddy proxies it, P0-15), e.g. `/u`. Loaded only after
   * consent; unset = no analytics and no cookie notice.
   */
  "NEXT_PUBLIC_UMAMI_PATH",
  "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
  /** P0-13: load the browser Sentry SDK (events go through /api/monitoring; the real DSN stays server-side). */
  "NEXT_PUBLIC_SENTRY_ENABLED",
] as const;

export type ClientEnv = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string;
  NEXT_PUBLIC_UMAMI_PATH?: string;
  NEXT_PUBLIC_UMAMI_WEBSITE_ID?: string;
  NEXT_PUBLIC_SENTRY_ENABLED: boolean;
};

/** The shape of a Zod issue that `formatEnvError` reads; a `z.ZodError` satisfies it, so the server reuses it. */
export type EnvIssue = { code: string; path: readonly PropertyKey[]; message: string };

const UMAMI_PATH = /^\/[a-z0-9-]+$/;
/** Same pattern as Zod 4's `z.uuid()` (RFC 9562 versions 1–8, plus the nil and max UUIDs). */
const UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

/**
 * Formats env issues (Zod's, or the client parser's) as a list of variable NAMES and rules. Values are never included. `source` is only used to
 * tell "missing" apart from "invalid", so the most common mistake reads plainly.
 */
export function formatEnvError(
  scope: string,
  error: { issues: readonly EnvIssue[] },
  source: Record<string, string | undefined> = {},
): Error {
  // Zod 4 messages describe the rule (expected type, allowed options), never the received value; tests pin this.
  const lines = error.issues.map((i) => {
    const name = i.path.map(String).join(".");
    // Absent variable failing a field rule. Custom (cross-field) rules keep their own message, e.g. SMTP_HOST.
    const missing = i.code !== "custom" && name !== "" && source[name] === undefined;
    return `  - ${name || "(env)"}: ${missing ? "missing (required)" : i.message}`;
  });
  return new Error(
    `Invalid ${scope} environment. Fix these variables (see .env.example):\n${lines.join("\n")}`,
  );
}

export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  const issues: EnvIssue[] = [];
  const known: readonly string[] = CLIENT_ENV_NAMES;
  const unknown = Object.keys(source).filter((k) => !known.includes(k));
  if (unknown.length > 0) {
    issues.push({
      code: "unrecognized_keys",
      path: [],
      message: `Unrecognized key(s): ${unknown.join(", ")}`,
    });
  }
  /** Blank counts as unset (a template line like `NAME=`). */
  const value = (name: (typeof CLIENT_ENV_NAMES)[number]): string | undefined =>
    source[name] === "" ? undefined : source[name];
  const check = (name: string, ok: boolean, message: string): void => {
    if (!ok) issues.push({ code: "invalid_format", path: [name], message });
  };

  const umamiPath = value("NEXT_PUBLIC_UMAMI_PATH");
  const umamiId = value("NEXT_PUBLIC_UMAMI_WEBSITE_ID");
  const sentry = value("NEXT_PUBLIC_SENTRY_ENABLED");
  check(
    "NEXT_PUBLIC_UMAMI_PATH",
    umamiPath === undefined || UMAMI_PATH.test(umamiPath),
    "must be a same-origin path like /u",
  );
  check(
    "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
    umamiId === undefined || UUID.test(umamiId),
    "Invalid UUID",
  );
  check(
    "NEXT_PUBLIC_SENTRY_ENABLED",
    sentry === undefined || sentry === "true" || sentry === "false",
    'Invalid option: expected one of "true"|"false"|""',
  );
  if (issues.length > 0) throw formatEnvError("client", { issues }, source);

  const env: ClientEnv = { NEXT_PUBLIC_SENTRY_ENABLED: sentry === "true" };
  const turnstile = value("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const vapid = value("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (turnstile !== undefined) env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = turnstile;
  if (vapid !== undefined) env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapid;
  if (umamiPath !== undefined) env.NEXT_PUBLIC_UMAMI_PATH = umamiPath;
  if (umamiId !== undefined) env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = umamiId;
  return env;
}

export const clientEnv: ClientEnv = parseClientEnv({
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
  NEXT_PUBLIC_UMAMI_PATH: process.env.NEXT_PUBLIC_UMAMI_PATH,
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
});
