import { clientEnv } from "@/lib/env";

/**
 * Runs in the browser before the app is interactive (Next 16 `instrumentation-client`). P0-13: when enabled,
 * loads the Sentry browser SDK in its own chunk once the browser is idle, so it never delays the first paint
 * or hydration (errors in the first second are not reported; server-side reporting covers the server).
 * `<html data-monitoring>` says where that load is (`loading`, then `on` or `failed`; `off` when disabled), so
 * a test that cuts the network waits for it instead of racing the idle timer (WebKit has no
 * `requestIdleCallback`: a 1.5 s timer; PD-11, CI 45476822891). Offline (the P1-14 offline card shell) the load
 * waits for the network: the chunk can't load, and a reporter can't send anyway; it stays `loading` until then.
 */
const root = document.documentElement;
if (clientEnv.NEXT_PUBLIC_SENTRY_ENABLED) {
  root.dataset.monitoring = "loading";
  const load = (): void => {
    if (!navigator.onLine) {
      window.addEventListener("online", load, { once: true });
      return;
    }
    import("@/lib/sentry-browser")
      .then((m) => {
        m.initBrowserSentry();
        root.dataset.monitoring = "on";
      })
      .catch(() => {
        root.dataset.monitoring = "failed";
      });
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 3_000 });
  else setTimeout(load, 1_500);
} else {
  root.dataset.monitoring = "off";
}
