import { type CardToken, cardKept } from "./qr-state";

/**
 * The page's side of the offline member card (P1-14; public/sw.js is the worker's side). Every call is guarded:
 * no Cache API (old browser, insecure origin), a private window that refuses storage, or no worker all mean
 * "nothing cached", never an error (PRODUCT §18: every cache is optional).
 */
export const CARD_CACHE = "moz-card-token";
export const CARD_URL = "/api/me/member-qr";
export const RECEIVED_HEADER = "x-moz-received-at";
/**
 * The offline shell marks its `<main>` with this so the card guard leaves the cached card alone there (the shell
 * always renders signed out). Kept here, not in a "use client" file: a server page importing a value from one
 * gets a client reference, not the string.
 */
export const OFFLINE_SHELL_ATTR = "data-offline-shell";

/** The full payload as the route sends it (qr-state's CardToken plus the cache fields). */
export type CardPayload = CardToken & { cacheUntil: number; owner: string };

export type CardFetch =
  | { kind: "card"; payload: CardPayload; receivedAt: number }
  /** Signed in without a customer profile (staff-only account): no card. */
  | { kind: "none" }
  | { kind: "signed-out" }
  /** No network and nothing cached, or a server/limit error: keep what is shown. */
  | { kind: "unavailable" };

const inflight = new Set<AbortController>();

/** Fetches the card payload; aborted by `clearCardCache` (a sign-out must never race a refetch, H1). */
export async function fetchCard(now: () => number = Date.now): Promise<CardFetch> {
  const ctrl = new AbortController();
  inflight.add(ctrl);
  try {
    const res = await fetch(CARD_URL, {
      cache: "no-store",
      credentials: "same-origin",
      signal: ctrl.signal,
    });
    if (res.status === 200) {
      const payload = (await res.json()) as CardPayload;
      // From the worker's cache: count from when it first arrived, never from now (a stale token must not
      // get five fresh minutes).
      const stamped = Number(res.headers.get(RECEIVED_HEADER));
      const receivedAt = stamped > 0 ? stamped : now();
      // A cached copy past its day (or from a clock that went back) is dropped here too, not only by the worker.
      if (stamped > 0 && !cardKept(payload, receivedAt, now())) {
        await dropCachedCard();
        return { kind: "unavailable" };
      }
      return { kind: "card", payload, receivedAt };
    }
    if (res.status === 404) return { kind: "none" };
    if (res.status === 401) return { kind: "signed-out" };
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  } finally {
    inflight.delete(ctrl);
  }
}

function cachesApi(): CacheStorage | null {
  try {
    return typeof caches === "undefined" ? null : caches;
  } catch {
    return null;
  }
}

async function dropCachedCard(): Promise<void> {
  try {
    await cachesApi()?.delete(CARD_CACHE);
  } catch {
    // Storage refused: nothing was cached.
  }
}

/** Tells the worker, and waits (≤ 1 s) for its answer. */
function tellWorker(message: { type: string }, waitMs = 1000): Promise<void> {
  // No `serviceWorker` on an insecure origin, whatever the types say.
  const worker =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker.controller
      : null;
  if (!worker) return Promise.resolve();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, waitMs);
    channel.port1.onmessage = done;
    try {
      worker.postMessage(message, [channel.port2]);
    } catch {
      done();
    }
  });
}

/**
 * Forgets the cached card: aborts card fetches in flight, deletes the cache and has the worker drop any write
 * from a fetch that began earlier. Awaited before a sign-out navigates away (design check H1).
 */
export async function clearCardCache(): Promise<void> {
  for (const ctrl of inflight) ctrl.abort();
  inflight.clear();
  await dropCachedCard();
  await tellWorker({ type: "signed-out" });
}

/** The cached card's owner tag, or null when nothing is cached. */
export async function cachedCardOwner(): Promise<string | null> {
  try {
    const api = cachesApi();
    if (!api || !(await api.has(CARD_CACHE))) return null;
    const hit = await (await api.open(CARD_CACHE)).match(CARD_URL);
    if (!hit) return null;
    const body = (await hit.json()) as { owner?: unknown };
    return typeof body.owner === "string" ? body.owner : "";
  } catch {
    return null;
  }
}

/**
 * Registers the worker (production builds only: in `next dev` it would keep dev files) and asks it to refresh
 * the offline shell. Never throws; never reloads the page.
 */
export async function registerCardWorker(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "refresh-shell" });
  } catch {
    // Blocked (private mode, a test that blocks workers): the card still works online.
  }
}
