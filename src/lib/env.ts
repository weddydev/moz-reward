import { z } from "zod";

/**
 * Browser-safe environment (P0-02): `NEXT_PUBLIC_*` variables only. Server variables live in `@/server/env`
 * (server-only), so this module can be imported from client components without pulling server names into the
 * bundle. Each value is read with a literal `process.env.NEXT_PUBLIC_…` so Next inlines it at build time.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const clientEnvSchema = z
  .object({
    /** Cloudflare Turnstile site key (public by design; the secret stays server-side). */
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional,
    /** Web Push VAPID public key (the browser needs it to subscribe; the private key stays server-side). */
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional,
    /**
     * P0-13: Umami analytics, same origin under this path (Caddy proxies it, P0-15), e.g. `/u`. Loaded only
     * after consent; unset = no analytics and no cookie notice.
     */
    NEXT_PUBLIC_UMAMI_PATH: z
      .string()
      .regex(/^\/[a-z0-9-]+$/, "must be a same-origin path like /u")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: z
      .uuid()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    /** P0-13: load the browser Sentry SDK (events go through /api/monitoring; the real DSN stays server-side). */
    NEXT_PUBLIC_SENTRY_ENABLED: z
      .enum(["true", "false", ""])
      .optional()
      .transform((v) => v === "true"),
  })
  .strict();

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Formats Zod issues as a list of variable NAMES and rules. Values are never included. `source` is only used to
 * tell "missing" apart from "invalid", so the most common mistake reads plainly.
 */
export function formatEnvError(
  scope: string,
  error: z.ZodError,
  source: Record<string, string | undefined> = {},
): Error {
  // Zod 4 messages describe the rule (expected type, allowed options), never the received value; tests pin this.
  const lines = error.issues.map((i) => {
    const name = i.path.join(".");
    // Absent variable failing a field rule. Custom (cross-field) rules keep their own message, e.g. SMTP_HOST.
    const missing = i.code !== "custom" && name !== "" && source[name] === undefined;
    return `  - ${name || "(env)"}: ${missing ? "missing (required)" : i.message}`;
  });
  return new Error(
    `Invalid ${scope} environment. Fix these variables (see .env.example):\n${lines.join("\n")}`,
  );
}

export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  const parsed = clientEnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  throw formatEnvError("client", parsed.error, source);
}

export const clientEnv: ClientEnv = parseClientEnv({
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
  NEXT_PUBLIC_UMAMI_PATH: process.env.NEXT_PUBLIC_UMAMI_PATH,
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
});
