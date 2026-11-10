import "server-only";
import { env } from "@/server/env";
import { redactText } from "@/server/jobs/redact";
import { log, serializeError } from "@/server/log";
import { reportUnexpected } from "@/server/observability/sentry";

/**
 * Better Auth's logger through pino (P0-13, C-03). Its own console logger would print outside our redaction and
 * JSON format. Arguments are reduced to safe shapes: errors serialised (pino's serializer), strings scrubbed
 * (emails, phone numbers, URL tokens), anything else by type only (objects can hold user rows). `error` logs are
 * unexpected by definition and also go to Sentry + the developers' alert.
 */
type Level = "debug" | "info" | "warn" | "error";

const LEVEL_FROM_ENV: Record<string, Level> = {
  trace: "debug",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
};

function safeArg(arg: unknown): unknown {
  if (arg instanceof Error) return serializeError(arg);
  if (typeof arg === "string") return redactText(arg);
  if (typeof arg === "number" || typeof arg === "boolean" || arg === null) return arg;
  return `[${typeof arg}]`;
}

export function logBetterAuth(level: Level, message: string, ...args: unknown[]): void {
  const fields = { src: "better-auth", ...(args.length > 0 ? { args: args.map(safeArg) } : {}) };
  log()[level](fields, redactText(message));
  if (level === "error") {
    const err = args.find((a): a is Error => a instanceof Error) ?? new Error(redactText(message));
    reportUnexpected(err, { where: "better-auth" });
  }
}

export function betterAuthLogger(): {
  disabled: boolean;
  disableColors: boolean;
  level: Level;
  log: (level: Level, message: string, ...args: unknown[]) => void;
} {
  return {
    disabled: false,
    disableColors: true,
    level: LEVEL_FROM_ENV[env().LOG_LEVEL] ?? "info",
    log: logBetterAuth,
  };
}
