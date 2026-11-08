import "server-only";

/**
 * Graceful shutdown for the worker process (P0-04). The first signal starts closing (workers wait for in-flight
 * jobs); later signals are ignored; if closing takes longer than `timeoutMs` the process exits 1 so the
 * orchestrator can restart it (stalled-job recovery then hands the job to another worker).
 */
export function createShutdown(deps: {
  close: () => Promise<void>;
  exit: (code: number) => void;
  log: (event: string, fields?: Record<string, unknown>) => void;
  timeoutMs: number;
}): (signal: string) => Promise<void> {
  let stopping: Promise<void> | undefined;
  return (signal) => {
    if (stopping) return stopping;
    deps.log("worker.stopping", { signal });
    const timer = setTimeout(() => {
      deps.log("worker.shutdown_timeout", { afterMs: deps.timeoutMs });
      deps.exit(1);
    }, deps.timeoutMs);
    timer.unref();
    stopping = deps
      .close()
      .then(() => {
        clearTimeout(timer);
        deps.log("worker.stopped");
        deps.exit(0);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        deps.log("worker.shutdown_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        deps.exit(1);
      });
    return stopping;
  };
}
