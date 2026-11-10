import "server-only";
import { z } from "zod";
import { formatEnvError } from "@/lib/env";

/**
 * Server-only environment (P0-02), validated at startup (`src/instrumentation.ts`, worker entry) and cached.
 * Fails closed: APP_ENV and APP_URL are required, test/dev conveniences are only possible on localhost, and
 * staging/production must run a production build. Error messages list variable NAMES only, never values.
 * Browser-safe `NEXT_PUBLIC_*` variables live in `@/lib/env` (clientEnv) and are never declared here.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const POSTGRES = ["postgres:", "postgresql:"] as const;
const REDIS = ["redis:", "rediss:"] as const;
const hasProtocol = (value: string, protocols: readonly string[]): boolean =>
  URL.canParse(value) && protocols.includes(new URL(value).protocol);
const protocolMessage = (protocols: readonly string[]): string =>
  `must be a ${protocols.map((p) => `${p}//`).join(" or ")} URL`;

/** Connection URL checked at startup, so a typo fails the boot instead of the first query. Never echoed. */
const connectionUrl = (protocols: readonly string[]) =>
  z
    .string()
    .min(1)
    .refine((v) => hasProtocol(v, protocols), protocolMessage(protocols));
const optionalConnectionUrl = (protocols: readonly string[]) =>
  optional.refine((v) => v === undefined || hasProtocol(v, protocols), protocolMessage(protocols));

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** A 256-bit key as base64 (`pnpm setup:env` and `openssl rand -base64 32` produce this). Never echoed. */
const key32 = z
  .string()
  .refine(
    (v) => BASE64.test(v) && Buffer.from(v, "base64").length === 32,
    "must be base64 of exactly 32 bytes",
  );

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "test", "staging", "production"]),
    APP_URL: z.url(),
    CDN_URL: z.url().optional(),

    /** Web/tenant role `moz_app` (no BYPASSRLS, P0-20): every request query runs under RLS. */
    DATABASE_URL: connectionUrl(POSTGRES),
    /** Identity role `moz_auth` (P0-20): Better Auth and role lookups, before any scope exists. */
    DATABASE_URL_AUTH: connectionUrl(POSTGRES),
    /** System role `moz_worker` (BYPASSRLS): worker and CLI only; the web never holds it (boot check). */
    DATABASE_URL_WORKER: optionalConnectionUrl(POSTGRES),
    DATABASE_URL_MIGRATIONS: optionalConnectionUrl(POSTGRES),
    DATABASE_URL_TEST: optionalConnectionUrl(POSTGRES),
    REDIS_URL: connectionUrl(REDIS),
    REDIS_URL_TEST: optionalConnectionUrl(REDIS),
    /** redis-cache (P0-18): data cache + pub/sub, `allkeys-lru`. Locally defaults to the dev instance on 6380. */
    REDIS_CACHE_URL: optionalConnectionUrl(REDIS),
    /** Key prefix: per worker in tests; empty locally; required in staging/production (e.g. `prod:`). */
    REDIS_KEY_PREFIX: z.string().default(""),

    AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    ADMIN_IP_ALLOWLIST: optional,
    /** Which proxy sets the client IP header (SECURITY §6): none (local/test), caddy, cloudflare. */
    TRUSTED_PROXY: z.enum(["none", "caddy", "cloudflare"]).default("none"),

    DATA_ENCRYPTION_KEY: key32,
    DATA_ENCRYPTION_KEY_ID: z.string().default("k1"),
    BLIND_INDEX_KEY: key32,
    MEMBER_QR_SIGNING_KEY: key32,

    EMAIL_PROVIDER: z.enum(["smtp", "resend", "brevo"]),
    EMAIL_API_KEY: optional,
    /** Secondary provider (P0-19): takes over when the primary fails. Required outside local/test. */
    EMAIL_FALLBACK_PROVIDER: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["smtp", "resend", "brevo"]).optional(),
    ),
    EMAIL_FALLBACK_API_KEY: optional,
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

    TURNSTILE_SECRET_KEY: optional,
    SENTRY_DSN: optional,
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
    /**
     * P0-13 (C-22): both developers' addresses for security/ops alerts and health mail, comma-separated.
     * Required outside local/test; locally the default lands in Mailpit.
     */
    ALERT_EMAILS: z
      .string()
      .optional()
      .transform((v, ctx) => {
        const list = (v ?? "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
        for (const address of list) {
          if (!z.email().safeParse(address).success) {
            ctx.addIssue({ code: "custom", message: "every entry must be an email address" });
            return z.NEVER;
          }
        }
        return list;
      }),
    /** Combined daily send cap of the email providers (ARCHITECTURE §10: Resend 100 + Brevo 300). */
    EMAIL_DAILY_CAP: z.coerce.number().int().positive().default(400),
    /**
     * P0-13: `/api/health/ready` returns its per-check detail only with this value in `x-health-token`
     * (deploy scripts, the System page); everyone else gets the status alone. Unset = never any detail.
     */
    HEALTH_TOKEN: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().min(32, "must be at least 32 characters").optional(),
    ),
    /** Filesystem the health monitor watches for the 80% disk alert (the data volume on the VPS). */
    DISK_PATH: z.string().default("/"),
    /** P0-15 turns this on once the backup jobs write their heartbeats (dump, WAL, restore drill). */
    BACKUPS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    /** Sentry free plan: errors per month (ARCHITECTURE §10); the 70% alert uses our own sent counter. */
    SENTRY_MONTHLY_QUOTA: z.coerce.number().int().positive().default(5000),
  })
  .superRefine((e, ctx) => {
    // Zod 4 still runs object refinements after a field failed; `z.url()` has already reported a bad
    // APP_URL, so skip the URL-based checks rather than letting `new URL()` throw a bare TypeError.
    const appUrl = URL.canParse(e.APP_URL) ? new URL(e.APP_URL) : undefined;
    const isLocalEnv = e.APP_ENV === "local" || e.APP_ENV === "test";
    // SECURITY §7: every secret is its own value — two equal secrets fail the boot (names only, never values).
    const secrets = [
      ["AUTH_SECRET", e.AUTH_SECRET],
      ["DATA_ENCRYPTION_KEY", e.DATA_ENCRYPTION_KEY],
      ["BLIND_INDEX_KEY", e.BLIND_INDEX_KEY],
      ["MEMBER_QR_SIGNING_KEY", e.MEMBER_QR_SIGNING_KEY],
      ["HEALTH_TOKEN", e.HEALTH_TOKEN ?? ""],
    ] as const;
    for (let i = 0; i < secrets.length; i++) {
      for (let j = i + 1; j < secrets.length; j++) {
        const [a, av] = secrets[i] ?? ["", ""];
        const [b, bv] = secrets[j] ?? ["", ""];
        if (av && av === bv) {
          ctx.addIssue({ code: "custom", path: [b], message: `must differ from ${a}` });
        }
      }
    }
    if (!isLocalEnv && e.ALERT_EMAILS.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["ALERT_EMAILS"],
        message: "required outside local/test (alerts and health mail to both developers)",
      });
    }
    if (!isLocalEnv && !e.TURNSTILE_SECRET_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["TURNSTILE_SECRET_KEY"],
        message: "required outside local/test (bot checks on sign-in)",
      });
    }
    // Sign-in links must not travel over SMTP without enforced TLS: deployed environments use the HTTPS APIs.
    for (const [name, value] of [
      ["EMAIL_PROVIDER", e.EMAIL_PROVIDER],
      ["EMAIL_FALLBACK_PROVIDER", e.EMAIL_FALLBACK_PROVIDER],
    ] as const) {
      if (!isLocalEnv && value === "smtp") {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "smtp is for local/test only (use resend or brevo)",
        });
      }
    }
    if (appUrl && isLocalEnv && !LOCAL_HOSTS.has(appUrl.hostname)) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ENV"],
        message: "local/test are only allowed when APP_URL is localhost",
      });
    }
    if (!isLocalEnv && e.NODE_ENV !== "production") {
      ctx.addIssue({
        code: "custom",
        path: ["NODE_ENV"],
        message: "must be production when APP_ENV is staging/production",
      });
    }
    if (appUrl && !isLocalEnv && appUrl.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "must use https outside local/test",
      });
    }
    if (!isLocalEnv && e.TRUSTED_PROXY === "none") {
      ctx.addIssue({
        code: "custom",
        path: ["TRUSTED_PROXY"],
        message: "must be caddy or cloudflare outside local/test (client IPs for rate limits)",
      });
    }
    // SEC-M3: outside local/test, both Redis instances are reached over TLS with a password, and keys carry an
    // env prefix. The cache instance is its own server (P0-18): never the queue one.
    if (!isLocalEnv && !e.REDIS_CACHE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_CACHE_URL"],
        message: "required outside local/test",
      });
    }
    if (e.REDIS_CACHE_URL && e.REDIS_CACHE_URL === e.REDIS_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_CACHE_URL"],
        message:
          "must be a different Redis instance from REDIS_URL (cache evicts; the queue must not)",
      });
    }
    for (const name of ["REDIS_URL", "REDIS_CACHE_URL"] as const) {
      const value = e[name];
      const url = value && URL.canParse(value) ? new URL(value) : undefined;
      if (url && !isLocalEnv && url.protocol !== "rediss:") {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "must use rediss:// (TLS) outside local/test",
        });
      }
      if (url && !isLocalEnv && url.password === "") {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "must include a password outside local/test",
        });
      }
    }
    if (!isLocalEnv && e.REDIS_KEY_PREFIX === "") {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_KEY_PREFIX"],
        message: "required outside local/test",
      });
    }
    if (e.EMAIL_PROVIDER === "smtp" && !e.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "required when EMAIL_PROVIDER=smtp",
      });
    }
    if ((e.EMAIL_PROVIDER === "resend" || e.EMAIL_PROVIDER === "brevo") && !e.EMAIL_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_API_KEY"],
        message: `required when EMAIL_PROVIDER=${e.EMAIL_PROVIDER}`,
      });
    }
    // Auth/security mail fails over to a second provider (ARCHITECTURE §2, §10).
    const fallback = e.EMAIL_FALLBACK_PROVIDER;
    if (!fallback && !isLocalEnv) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FALLBACK_PROVIDER"],
        message: "required outside local/test (sign-in mail must survive a provider outage)",
      });
    }
    if (fallback && fallback === e.EMAIL_PROVIDER) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FALLBACK_PROVIDER"],
        message: "must differ from EMAIL_PROVIDER",
      });
    }
    if ((fallback === "resend" || fallback === "brevo") && !e.EMAIL_FALLBACK_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FALLBACK_API_KEY"],
        message: `required when EMAIL_FALLBACK_PROVIDER=${fallback}`,
      });
    }
    if (fallback === "smtp" && !e.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "required when EMAIL_FALLBACK_PROVIDER=smtp",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Pure parse for tests and startup checks. Throws with variable names only. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  throw formatEnvError("server", parsed.error, source);
}

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
