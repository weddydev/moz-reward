import "server-only";
import { z } from "zod";

/**
 * Server-only environment, validated once on first use (and at startup via instrumentation).
 * Fails closed: APP_ENV and APP_URL are required, and test/dev conveniences are only possible on localhost.
 * Error messages list variable NAMES only, never values.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "test", "staging", "production"]),
    APP_URL: z.url(),
    CDN_URL: z.url().optional(),

    DATABASE_URL: z.string().min(1),
    DATABASE_URL_MIGRATIONS: optional,
    DATABASE_URL_TEST: optional,
    REDIS_URL: z.string().min(1),
    REDIS_URL_TEST: optional,
    /** Per-worker key prefix in tests; empty elsewhere. */
    REDIS_KEY_PREFIX: z.string().default(""),

    AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    ADMIN_IP_ALLOWLIST: optional,

    DATA_ENCRYPTION_KEY: optional,
    DATA_ENCRYPTION_KEY_ID: z.string().default("k1"),
    BLIND_INDEX_KEY: optional,
    MEMBER_QR_SIGNING_KEY: optional,

    EMAIL_PROVIDER: z.enum(["smtp", "resend", "brevo"]),
    EMAIL_API_KEY: optional,
    EMAIL_FROM: z.string().min(3),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    MAILPIT_API_URL: optional,

    S3_ENDPOINT: optional,
    S3_REGION: z.string().default("auto"),
    S3_ACCESS_KEY_ID: optional,
    S3_SECRET_ACCESS_KEY: optional,
    S3_BUCKET: optional,
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    S3_PUBLIC_BASE_URL: optional,

    TURNSTILE_SITE_KEY: optional,
    TURNSTILE_SECRET_KEY: optional,
    SENTRY_DSN: optional,
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((e, ctx) => {
    // Zod 4 still runs object refinements after a field failed; `z.url()` has already reported a bad
    // APP_URL, so skip the URL-based checks rather than letting `new URL()` throw a bare TypeError.
    const appUrl = URL.canParse(e.APP_URL) ? new URL(e.APP_URL) : undefined;
    const isLocalEnv = e.APP_ENV === "local" || e.APP_ENV === "test";
    if (appUrl && isLocalEnv && !LOCAL_HOSTS.has(appUrl.hostname)) {
      ctx.addIssue({ code: "custom", path: ["APP_ENV"], message: "local/test are only allowed when APP_URL is localhost" });
    }
    if (appUrl && !isLocalEnv && appUrl.protocol !== "https:") {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https outside local/test" });
    }
    if (e.EMAIL_PROVIDER === "smtp" && !e.SMTP_HOST) {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "required when EMAIL_PROVIDER=smtp" });
    }
    if ((e.EMAIL_PROVIDER === "resend" || e.EMAIL_PROVIDER === "brevo") && !e.EMAIL_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["EMAIL_API_KEY"], message: `required when EMAIL_PROVIDER=${e.EMAIL_PROVIDER}` });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Pure parse for tests and startup checks. Throws with variable names only. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
  throw new Error(`Invalid server environment:\n${issues.join("\n")}`);
}

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
