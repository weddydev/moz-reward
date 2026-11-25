/**
 * Warms a lazy chunk ahead of need (on hover or press) without making a failure an error (PD-11): a preload that
 * fails (offline, or its fetch cancelled because the page navigated away) changes nothing for the user, since the
 * real load retries when the chunk is wanted. Unhandled, WebKit reports it as an uncaught "TypeError: Load
 * failed" (CI/E2E iphone14, leave-and-rejoin flow).
 */
export function preloadQuietly(load: () => Promise<unknown>): void {
  try {
    load().catch(() => undefined);
  } catch {
    /* no loader: nothing to warm */
  }
}
