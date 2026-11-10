import type { Instrumentation } from "next";

/**
 * Runs once when the Next.js server starts (P0-02, P0-19). Validates the server environment (and, in
 * staging/production, the database role) before any request is served. On failure the process EXITS with a
 * message naming the variable (never its value): Next would otherwise log the error and keep serving 500s.
 * P0-13: then starts Sentry (errors only; off without SENTRY_DSN).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootOrExit, runBootChecks } = await import("@/server/boot");
  await bootOrExit(runBootChecks);
  const { initSentry } = await import("@/server/observability/sentry");
  initSentry("web");
}

/**
 * P0-13: errors Next caught while rendering, in route handlers, server actions or the proxy. Reported with the
 * route *file* path (never the request path: it can carry a sign-in token) and the request id.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("@/server/observability/request-error");
  reportRequestError(err, request.headers, context.routePath, context.routeType);
};
