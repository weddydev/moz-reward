import "server-only";
import pino, { type DestinationStream, type Logger } from "pino";
import { env } from "@/server/env";
import { redactText } from "@/server/jobs/redact";

/**
 * Structured logging (P0-05, ENGINEERING §13, SECURITY §7). JSON lines via pino. Personal data and secrets
 * are redacted by key at any depth up to three levels (tokens, cookies, authorization, email, phone, codes,
 * passwords), and emails / phone numbers written into the message text are scrubbed too. Use a child logger
 * per request (`requestLogger`) so every line carries the request id.
 */
export type { Logger };

const SENSITIVE_KEYS = [
  "email",
  "phone",
  "mobile",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "password",
  "secret",
  "code",
  "otp",
  "apiKey",
  "cookie",
  '"set-cookie"',
  "authorization",
] as const;

/** `key`, `*.key`, `*.*.key`: pino needs explicit paths; three levels covers request/user/payload shapes. */
export const REDACT_PATHS: string[] = SENSITIVE_KEYS.flatMap((k) => {
  const seg = k.startsWith('"') ? `[${k}]` : `.${k}`;
  const top = k.startsWith('"') ? `[${k}]` : k;
  return [top, `*${seg}`, `*.*${seg}`];
});

export function createLogger(
  opts: { destination?: DestinationStream; level?: string } = {},
): Logger {
  return pino(
    {
      level: opts.level ?? env().LOG_LEVEL,
      base: { app: "moz-rewards", env: process.env.APP_ENV },
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      serializers: { err: serializeError },
      hooks: {
        // Scrub free text (message strings and printf args): emails, phone numbers, tokens in URLs.
        logMethod(args, method) {
          const scrubbed = args.map((a: unknown) => (typeof a === "string" ? redactText(a) : a));
          method.apply(this, scrubbed as Parameters<typeof method>);
        },
      },
    },
    opts.destination,
  );
}

const state = ((globalThis as { __mozLog?: { logger?: Logger } }).__mozLog ??= {});

/** Process-wide logger (lazy, so importing this module never validates the environment by itself). */
export function log(): Logger {
  state.logger ??= createLogger();
  return state.logger;
}

/** Child logger for one request; pass the `x-request-id` set by the proxy. */
export function requestLogger(requestId: string, fields: Record<string, unknown> = {}): Logger {
  return log().child({ requestId, ...fields });
}

/** Error fields that carry row values or request data (pg `detail`, Drizzle `params`, HTTP clients…). */
const ERROR_VALUE_FIELDS = new Set([
  "params",
  "parameters",
  "query",
  "detail",
  "where",
  "response",
  "request",
  "config",
  "headers",
  "body",
]);
const MAX_CAUSE_DEPTH = 3;

/** Drizzle appends the bound values to the message: "Failed query: …\nparams: a,b". Keep the SQL, drop values. */
const scrubErrorText = (text: string): string =>
  redactText(text.replace(/\nparams:[^\n]*/g, "\nparams: [redacted]"));

/**
 * `err` serializer (SECURITY §7, review P0-B): pino's standard one copies message, stack and every
 * enumerable property verbatim, so a failed insert would log the email it tried to insert.
 */
export function serializeError(err: unknown, depth = 0): unknown {
  if (!(err instanceof Error)) return typeof err === "string" ? scrubErrorText(err) : err;
  const base = pino.stdSerializers.err(err) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (ERROR_VALUE_FIELDS.has(key) || key === "cause") continue;
    // Postgres SQLSTATE (e.g. 23505) is a diagnostic, not data; "code" itself is a redacted key.
    if (key === "code" && typeof value === "string" && /^[0-9A-Z]{5}$/.test(value))
      out.sqlState = value;
    else out[key] = typeof value === "string" ? scrubErrorText(value) : value;
  }
  if (err.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    out.cause = serializeError(err.cause, depth + 1);
  }
  return out;
}
