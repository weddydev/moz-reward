import type { FullConfig } from "@playwright/test";

/**
 * Runs after the E2E server is up and before any test. `next dev` compiles each route on its first
 * request; with five projects starting in parallel that first hit can exceed assertion timeouts
 * (seen as Chromium-only failures on a cold server). Compiling the routes once up front removes that.
 * Add new top-level routes here as they are built.
 */
export const ROUTES = [
  "/",
  "/sign-in",
  "/sign-in/link-expired",
  "/staff/sign-in",
  "/staff/security",
  "/me/security",
  "/wallet",
  "/dashboard",
  "/dev/ui",
  "/dev/guard-check",
  "/api/auth/get-session",
];

export default async function warmUp(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL || process.env.E2E_BASE_URL) return; // deployed targets are already built
  const started = Date.now();
  for (const route of ROUTES) {
    const res = await fetch(new URL(route, baseURL), {
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status >= 500) throw new Error(`[e2e] warm-up: ${route} answered ${res.status}`);
  }
  console.warn(`[e2e] warmed ${ROUTES.length} routes in ${Date.now() - started}ms`);
}
