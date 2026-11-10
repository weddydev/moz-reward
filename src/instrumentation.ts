/**
 * Runs once when the Next.js server starts (P0-02, P0-19). Validates the server environment (and, in
 * staging/production, the database role) before any request is served. On failure the process EXITS with a
 * message naming the variable (never its value): Next would otherwise log the error and keep serving 500s.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootOrExit, runBootChecks } = await import("@/server/boot");
  await bootOrExit(runBootChecks);
}
