/**
 * Auth client calls return `{ data, error }` for HTTP errors but *throw* when the request never completes
 * (offline, DNS, server down). `withNetworkGuard` turns that throw into a user-facing message so forms never
 * hang on "Sending…" or raise an unhandled rejection (QA-1).
 */
export function networkErrorMessage(): string {
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "You're offline. Check your connection and try again."
    : "We couldn't reach Moz Rewards. Please try again.";
}

export async function withNetworkGuard<T>(
  call: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await call() };
  } catch {
    return { ok: false, message: networkErrorMessage() };
  }
}
