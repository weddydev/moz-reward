/**
 * Background worker entry (`pnpm worker`, P0-04). Validates the environment, starts one BullMQ worker per
 * queue, registers the repeatable schedules (idempotent), and shuts down gracefully: on SIGTERM/SIGINT it stops
 * taking new jobs and waits for in-flight ones before exiting. Runs with the react-server condition so
 * `server-only` modules load outside Next.
 */
import "../../scripts/load-env";
import { env } from "@/server/env";
import { closeQueues } from "@/server/jobs/queues";
import { registerSchedules } from "@/server/jobs/scheduler";
import { createShutdown } from "@/server/jobs/shutdown";
import { startWorkers } from "@/server/jobs/worker";

/** Longest we wait for in-flight jobs on shutdown (container stop grace period is 60 s). */
const SHUTDOWN_TIMEOUT_MS = 45_000;

const log = (event: string, fields: Record<string, unknown> = {}): void => {
  console.warn(JSON.stringify({ at: new Date().toISOString(), src: "worker", event, ...fields }));
};

async function main(): Promise<void> {
  try {
    env();
  } catch (err) {
    console.error(`[worker] ${(err as Error).message}`);
    process.exit(1);
  }

  const running = startWorkers();
  const schedules = await registerSchedules();
  log("worker.started", { queues: running.workers.map((w) => w.name), schedules });

  const shutdown = createShutdown({
    close: () => Promise.all([running.close(), closeQueues()]).then(() => undefined),
    exit: (code) => process.exit(code),
    log,
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

void main().catch((err: unknown) => {
  log("worker.start_failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
