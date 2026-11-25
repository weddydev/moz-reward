/**
 * The offline queue for "Request points" (P1-11, PRODUCT §19 "No signal at counter: request queued and
 * retried"). A tap that can't reach the server is kept on this device with its idempotency key and retried
 * with the **same** key when the phone is back online, so the server makes at most one request from it (a
 * retry of a request that did arrive returns that request). The server stamps the receipt time; the tap time
 * kept here is sent as advisory only.
 *
 * Storage is injected (localStorage in the browser) and every access is guarded: a private window or blocked
 * storage just means nothing is queued, never a crash. Entries older than a request's life (24 h) are dropped
 * unsent: by then the customer has left the counter.
 */
export type QueuedRequest = { shopId: string; key: string; at: string };

export type QueueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const QUEUE_KEY = "moz:request-queue:v1";
/** A queued tap older than this is dropped unsent. */
export const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** At most one queued tap per shop, and a handful in all. */
export const QUEUE_MAX = 10;
/** Fired on window when the queue changes, so every RequestPoints on the page re-reads it. */
export const QUEUE_EVENT = "moz:request-queue";

const isEntry = (v: unknown): v is QueuedRequest =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as QueuedRequest).shopId === "string" &&
  typeof (v as QueuedRequest).key === "string" &&
  typeof (v as QueuedRequest).at === "string" &&
  !Number.isNaN(Date.parse((v as QueuedRequest).at));

/** The queued taps still worth sending at `now` (stale and malformed entries are left out). */
export function readQueue(storage: QueueStorage | null, now: Date): QueuedRequest[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isEntry)
      .filter((e) => now.getTime() - Date.parse(e.at) < QUEUE_MAX_AGE_MS);
  } catch {
    return [];
  }
}

function writeQueue(storage: QueueStorage | null, entries: QueuedRequest[]): boolean {
  if (!storage) return false;
  try {
    if (entries.length === 0) storage.removeItem(QUEUE_KEY);
    else storage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(-QUEUE_MAX)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Queues a tap for `shopId`. A shop that already has one queued keeps the first (its key is the one the server
 * may already have seen). Returns the entry that is queued, or null if the device can't store it.
 */
export function enqueueRequest(
  storage: QueueStorage | null,
  entry: QueuedRequest,
  now: Date,
): QueuedRequest | null {
  const queue = readQueue(storage, now);
  const existing = queue.find((e) => e.shopId === entry.shopId);
  if (existing) return existing;
  return writeQueue(storage, [...queue, entry]) ? entry : null;
}

/** Removes the queued tap with `key` (sent, or refused for good). */
export function dropQueued(storage: QueueStorage | null, key: string, now: Date): void {
  const queue = readQueue(storage, now);
  writeQueue(
    storage,
    queue.filter((e) => e.key !== key),
  );
}

/** The queued tap for `shopId`, if any. */
export const queuedFor = (
  storage: QueueStorage | null,
  shopId: string,
  now: Date,
): QueuedRequest | null => readQueue(storage, now).find((e) => e.shopId === shopId) ?? null;

const KEEP_CODES = new Set(["RATE_LIMITED", "UNAVAILABLE", "UNAUTHENTICATED"]);

/**
 * What to do with a queued tap after a send attempt: `drop` it when the server answered for good (sent, or a
 * refusal a retry can't change), `keep` it for the next time the phone is online (no answer, or a short-lived
 * refusal: rate limit, service briefly unavailable, signed out until the customer signs in again).
 */
export function afterSend(
  outcome: { ok: true } | { ok: false; code: string } | { thrown: true },
): "drop" | "keep" {
  if ("thrown" in outcome) return "keep";
  if (outcome.ok) return "drop";
  return KEEP_CODES.has(outcome.code) ? "keep" : "drop";
}

/** localStorage when the browser allows it, else null. */
export function browserQueueStorage(): QueueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
