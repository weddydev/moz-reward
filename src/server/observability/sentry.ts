import "server-only";
import * as Sentry from "@sentry/node";
import { scrubBreadcrumb, scrubEvent, sentryDataCollection } from "@/lib/sentry-scrub";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { raiseAlert, sharedAlerter } from "@/server/ops/alerts";
import { countSentryEvent } from "@/server/ops/usage";

/**
 * Sentry for the web server and the worker (P0-13, ARCHITECTURE §11; inventory in DECISIONS P0-13 Sentry).
 * Errors only: no tracing, no OpenTelemetry, no module instrumentation, no default PII. Every event is scrubbed
 * (src/lib/sentry-scrub.ts, C-26), capped per process (a crash loop can't burn the 5,000/month free quota) and
 * counted for the 70% quota alert. No DSN (local, tests by default) = Sentry is off; errors still go to the
 * log and, for unexpected ones, to the developers' alert email.
 */
export type SentryProcess = "web" | "worker";

/** At most this many events per process per window; the rest are dropped (they remain in the log). */
export const SENTRY_CAP = { events: 30, windowMs: 10 * 60_000 } as const;

const cap = { start: 0, count: 0, dropped: 0 };

export function allowSentryEvent(now = Date.now()): boolean {
  if (now - cap.start >= SENTRY_CAP.windowMs) {
    if (cap.dropped > 0)
      log().warn({ dropped: cap.dropped }, "sentry events dropped by the per-process cap");
    cap.start = now;
    cap.count = 0;
    cap.dropped = 0;
  }
  if (cap.count >= SENTRY_CAP.events) {
    cap.dropped++;
    return false;
  }
  cap.count++;
  return true;
}

export function initSentry(
  process: SentryProcess,
  opts: { dsn?: string; transport?: Sentry.NodeOptions["transport"] } = {},
): boolean {
  const e = env();
  const dsn = opts.dsn ?? e.SENTRY_DSN;
  if (!dsn) return false;
  // No onUncaughtException/onUnhandledRejection integrations: they print raw errors to the console and exit
  // without our graceful shutdown. The worker registers its own handlers (src/worker/index.ts: pino, report,
  // flush, drain, exit 1); Next handles the web process's.
  const integrations = [
    Sentry.dedupeIntegration(),
    Sentry.linkedErrorsIntegration(),
    Sentry.eventFiltersIntegration(),
  ];
  Sentry.initWithoutDefaultIntegrations({
    dsn,
    environment: e.APP_ENV,
    ...(e.APP_RELEASE ? { release: e.APP_RELEASE } : {}),
    sampleRate: e.SENTRY_ERROR_SAMPLE_RATE,
    dataCollection: sentryDataCollection(),
    includeLocalVariables: false,
    includeServerName: false,
    enableOpenTelemetrySetup: false,
    enableRuntimeChannelInjection: false,
    maxBreadcrumbs: 30,
    integrations,
    initialScope: { tags: { process } },
    ...(opts.transport ? { transport: opts.transport } : {}),
    beforeSend(event) {
      if (!allowSentryEvent()) return null;
      countSentryEvent();
      return scrubEvent(event);
    },
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  return true;
}

/**
 * An unexpected error (the action template, route handlers, `onRequestError`, Better Auth's error log): to
 * Sentry with the request id, and to both developers as `error.unexpected` (deduplicated per 5 min). The
 * caller has already logged it.
 */
export function reportUnexpected(err: unknown, ctx: { where: string; requestId?: string }): void {
  if (Sentry.isInitialized()) {
    Sentry.withScope((scope) => {
      scope.setTag("where", ctx.where);
      if (ctx.requestId) scope.setTag("request_id", ctx.requestId);
      Sentry.captureException(err);
    });
  }
  raiseAlert({
    kind: "error.unexpected",
    category: "ops",
    detail: {
      where: ctx.where,
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      type: err instanceof Error ? err.name : typeof err,
    },
  });
}

/** A job that exhausted its retries: to Sentry only (the health monitor emails `health.failed_jobs`). */
export function captureJobFailure(err: unknown, ctx: { queue: string; job: string }): void {
  if (!Sentry.isInitialized()) return;
  Sentry.withScope((scope) => {
    scope.setTag("where", `job ${ctx.queue}:${ctx.job}`);
    Sentry.captureException(err);
  });
}

/**
 * A crash about to end the process (worker `uncaughtException`): unlike reportUnexpected, this waits — at most
 * `timeoutMs` — for the developers' alert email and the Sentry flush, so the process can't exit first.
 */
export async function reportFatal(err: unknown, where: string, timeoutMs = 5_000): Promise<void> {
  if (Sentry.isInitialized()) {
    Sentry.withScope((scope) => {
      scope.setTag("where", where);
      Sentry.captureException(err);
    });
  }
  const alert = sharedAlerter().raise({
    kind: "error.unexpected",
    category: "ops",
    detail: { where, type: err instanceof Error ? err.name : typeof err, fatal: true },
  });
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.allSettled([alert, flushSentry(timeoutMs)]),
    new Promise((r) => {
      timer = setTimeout(r, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}

/** Before a process exits (worker shutdown): deliver what is queued, up to `timeoutMs`. */
export function flushSentry(timeoutMs = 2_000): Promise<boolean> {
  return Sentry.isInitialized() ? Sentry.flush(timeoutMs) : Promise.resolve(true);
}
