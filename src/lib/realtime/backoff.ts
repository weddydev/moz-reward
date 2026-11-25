/**
 * Reconnect timing for the realtime client (P1-10, ARCHITECTURE §7): exponential backoff with full jitter, so
 * thousands of phones that lost the stream together (deploy, Redis restart) do not come back together.
 */
export const BACKOFF = {
  baseMs: 1_000,
  capMs: 30_000,
  /** Never retry sooner than this, even when the jitter rolls zero. */
  floorMs: 250,
  /** A stream that stayed open this long counts as healthy: the next failure starts from attempt 0. */
  healthyAfterMs: 30_000,
  /** Upper bound on a server's Retry-After, so a broken header never parks the client for hours. */
  maxRetryAfterMs: 120_000,
} as const;

/** Delay before reconnect attempt `attempt` (0-based): uniform in [floor, min(cap, base·2^attempt)). */
export function nextDelay(attempt: number, rand: () => number = Math.random): number {
  const exp = Math.min(Math.max(0, attempt), 30);
  const ceiling = Math.min(BACKOFF.capMs, BACKOFF.baseMs * 2 ** exp);
  return Math.max(BACKOFF.floorMs, Math.floor(rand() * ceiling));
}

/** Delay for a 429/503 with `Retry-After: <seconds>`, plus up to 50% jitter; null when absent or not a number. */
export function retryAfterDelay(
  header: string | null,
  rand: () => number = Math.random,
): number | null {
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  const ms = Number(header.trim()) * 1_000;
  if (ms >= BACKOFF.maxRetryAfterMs) return BACKOFF.maxRetryAfterMs;
  return Math.min(BACKOFF.maxRetryAfterMs, Math.floor(ms * (1 + rand() * 0.5)));
}
