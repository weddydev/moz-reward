import { z } from "zod";

/**
 * Server-only environment, validated once on first use.
 * Optional third-party keys stay optional so local dev works before the human tasks are done.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  CDN_URL: z.url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),
  DATABASE_URL_MIGRATIONS: optional,
  DATABASE_URL_TEST: optional,
  REDIS_URL: z.string().min(1).default("redis://:moz@localhost:6379"),
  REDIS_URL_TEST: optional,

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  ADMIN_IP_ALLOWLIST: optional,

  DATA_ENCRYPTION_KEY: optional,
  DATA_ENCRYPTION_KEY_ID: z.string().default("k1"),
  BLIND_INDEX_KEY: optional,
  MEMBER_QR_SIGNING_KEY: optional,

  EMAIL_PROVIDER: z.enum(["console", "resend", "brevo"]).default("console"),
  EMAIL_API_KEY: optional,
  EMAIL_FROM: z.string().default("Moz Rewards <hello@example.co.uk>"),

  TURNSTILE_SITE_KEY: optional,
  TURNSTILE_SECRET_KEY: optional,
  SENTRY_DSN: optional,
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid server environment:\n${issues.join("\n")}`);
  }
  if (parsed.data.APP_ENV === "production" && parsed.data.EMAIL_PROVIDER === "console") {
    throw new Error("EMAIL_PROVIDER=console is not allowed in production");
  }
  cached = parsed.data;
  return cached;
}
