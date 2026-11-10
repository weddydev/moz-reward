/**
 * Background worker entry (`pnpm worker`, P0-04). Validates the environment, starts one BullMQ worker per
 * queue and the outbox relay (P0-18), registers the repeatable schedules (idempotent), and shuts down
 * gracefully: on SIGTERM/SIGINT the relay finishes its batch, workers stop taking new jobs and wait for
 * in-flight ones before exiting. Runs as plain Node with scripts/server-only-hook.mjs (not the react-server
 * condition, which would stop react-dom/server rendering emails).
 */
import "../../scripts/load-env";
import { bootOrExit, runBootChecks } from "@/server/boot";
import { setDbProcess } from "@/server/db/client";
import { startHealthMonitor } from "@/server/jobs/health-monitor";
import { closeQueues } from "@/server/jobs/queues";
import { type RunningRelay, startRelay } from "@/server/jobs/relay";
import { registerSchedules } from "@/server/jobs/scheduler";
import { createShutdown, WORKER_DRAIN_MS } from "@/server/jobs/shutdown";
import { type RunningWorkers, startWorkers } from "@/server/jobs/worker";
import { log as appLog } from "@/server/log";
import {
  flushSentry,
  initSentry,
  reportFatal,
  reportUnexpected,
} from "@/server/observability/sentry";
import { enableDirectAlertDelivery } from "@/server/ops/alerts";

const log = (event: string, fields: Record<string, unknown> = {}): void => {
  appLog()
    .child({ src: "worker" })
    .warn({ event, ...fields }, event);
};

async function main(): Promise<void> {
  // Worker statement limits (60 s) before any query creates the pool.
  setDbProcess("worker");
  // P0-13: this process emails alerts itself (critical mail; still works while redis-queue is down).
  enableDirectAlertDelivery();
  // Same startup checks as the web server: env, and in staging/production the database role (P0-19).
  await bootOrExit(runBootChecks);
  initSentry("worker");

  // Signal handlers go in before any worker starts, so a stop during start-up is still graceful.
  const started: {
    running?: RunningWorkers;
    relay?: RunningRelay;
    monitor?: ReturnType<typeof startHealthMonitor>;
  } = {};
  let crashed = false;
  let crashReported: Promise<void> = Promise.resolve();
  const shutdown = createShutdown({
    // Relay first (no new dispatches), then workers: in-flight handlers may still use the producer connection.
    close: async () => {
      await started.monitor?.stop();
      await started.relay?.stop();
      await started.running?.close();
      await closeQueues();
      await flushSentry();
    },
    exit: (code) => {
      void crashReported.finally(() => process.exit(crashed ? 1 : code));
    },
    log,
    timeoutMs: WORKER_DRAIN_MS,
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  // P0-13: crashes go through pino (redaction) and Sentry, then the same drain as SIGTERM, exiting 1.
  process.on("unhandledRejection", (reason) => {
    log("worker.unhandled_rejection", {
      error: reason instanceof Error ? reason.name : typeof reason,
    });
    reportUnexpected(reason, { where: "worker unhandledRejection" });
  });
  process.on("uncaughtException", (err) => {
    log("worker.uncaught_exception", { error: err.name });
    if (crashed) return;
    crashed = true;
    // Stop taking jobs at once; the exit (after the drain) waits for the alert email and Sentry (≤ 5 s).
    crashReported = reportFatal(err, "worker uncaughtException");
    void shutdown("uncaughtException");
  });

  const running = startWorkers();
  started.running = running;
  started.relay = startRelay();
  // P0-13: its own timer, not a BullMQ job, so it still checks and emails while redis-queue is down.
  started.monitor = startHealthMonitor();
  const schedules = await registerSchedules();
  log("worker.started", { queues: running.workers.map((w) => w.name), schedules });
}

void main().catch((err: unknown) => {
  log("worker.start_failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
