import "server-only";
import { HEARTBEAT_MS } from "@/lib/realtime/events";
import { validStreamSessions } from "@/server/auth/stream-sessions";
import { cacheRedis } from "@/server/cache";
import { env } from "@/server/env";
import { createRedis } from "@/server/jobs/connection";
import { log } from "@/server/log";
import { createHub, type Hub } from "./hub";
import { reportConnections } from "./presence";

/**
 * The web process's one realtime hub (P1-10), wired to the real subscriber (redis-cache), the identity layer's
 * batched session check and the presence counter. Kept on globalThis so Next's module duplication can't create
 * a second hub (and a second subscriber connection).
 */
export const REALTIME_CAPS = {
  /** ARCHITECTURE §7 defaults. */
  perUser: 5,
  perShop: 50,
  /** Process-wide ceiling (security design check M4): past it a new stream gets 503 + Retry-After. */
  total: 2_000,
} as const;

const state = ((
  globalThis as { __mozRealtime?: { hub?: Hub; signals?: boolean } }
).__mozRealtime ??= {});

export function realtimeHub(): Hub {
  state.hub ??= createHub({
    subscriber: () => createRedis("subscriber"),
    channelPrefix: env().REDIS_KEY_PREFIX,
    checkSessions: validStreamSessions,
    now: Date.now,
    rand: Math.random,
    heartbeatMs: HEARTBEAT_MS,
    caps: REALTIME_CAPS,
    report: (n) => {
      reportConnections(cacheRedis(), n).catch(() => undefined);
    },
  });
  return state.hub;
}

/**
 * C-28: on SIGTERM/SIGINT every open stream gets a jittered `retry:` and closes, so clients reconnect to the
 * other replica spread over ~10 s instead of all at once. Next's own handler (registered first) stops accepting
 * connections and waits for open requests; closing the streams promptly lets it finish inside the container's
 * 30 s stop grace period. NEXT_MANUAL_SIG_HANDLE stays unset (both handlers run).
 */
export function registerRealtimeShutdown(): void {
  if (state.signals) return;
  state.signals = true;
  const drain = (signal: string): void => {
    const hub = realtimeHub();
    log().info({ signal, streams: hub.stats().streams }, "realtime: closing streams for shutdown");
    hub.shutdown();
  };
  process.once("SIGTERM", () => {
    drain("SIGTERM");
  });
  process.once("SIGINT", () => {
    drain("SIGINT");
  });
}

/** Closes the process hub and its subscriber (tests; a later call to `realtimeHub()` builds a new one). */
export function closeRealtimeHub(): void {
  state.hub?.dispose();
  delete state.hub;
}
