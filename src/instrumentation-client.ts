import { clientEnv } from "@/lib/env";

/**
 * Runs in the browser before the app is interactive (Next 16 `instrumentation-client`). P0-13: when enabled,
 * loads the Sentry browser SDK in its own chunk once the browser is idle, so it never delays the first paint
 * or hydration (errors in the first second are not reported; server-side reporting covers the server).
 */
if (clientEnv.NEXT_PUBLIC_SENTRY_ENABLED) {
  const load = (): void => {
    import("@/lib/sentry-browser")
      .then((m) => {
        m.initBrowserSentry();
      })
      .catch(() => undefined);
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 3_000 });
  else setTimeout(load, 1_500);
}
