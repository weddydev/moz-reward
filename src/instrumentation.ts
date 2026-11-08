/**
 * Runs once when the Next.js server starts (P0-02). Validates the server environment before any request is
 * served, so a missing or malformed variable stops startup with a message naming it (never its value),
 * instead of surfacing later as a 500 on the first request that happens to read it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/server/env");
  env();
}
