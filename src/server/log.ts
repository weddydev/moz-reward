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
      serializers: { err: pino.stdSerializers.err },
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
