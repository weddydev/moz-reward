/**
 * Background worker entry (BullMQ processors + schedules are registered here from P1).
 * Kept alive until SIGINT/SIGTERM so `pnpm worker` behaves like the real process.
 */
const shutdown = (signal: string) => {
  console.warn(`[worker] ${signal} received, shutting down`);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.warn("[worker] started (no queues registered yet)");
setInterval(() => {}, 1 << 30);
