/**
 * Background worker entry (BullMQ processors + schedules are registered here from P1).
 * Validates the server environment first (P0-02): a bad configuration stops the worker at start with the
 * variable names, never their values. Kept alive until SIGINT/SIGTERM so `pnpm worker` behaves like the real
 * process. `pnpm worker` runs with the react-server condition so `server-only` modules load outside Next.
 */
import "../../scripts/load-env";
import { env } from "@/server/env";

try {
  env();
} catch (err) {
  console.error(`[worker] ${(err as Error).message}`);
  process.exit(1);
}

const shutdown = (signal: string): void => {
  console.warn(`[worker] ${signal} received, shutting down`);
  process.exit(0);
};

process.on("SIGINT", () => {
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

console.warn("[worker] started (no queues registered yet)");
setInterval(() => {}, 1 << 30);
