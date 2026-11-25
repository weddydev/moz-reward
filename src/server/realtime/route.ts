import "server-only";
import { parseShopId } from "@/lib/brand";
import { streamDeadline } from "@/server/auth/stream-sessions";
import { ALL_SHOP_ROLES, requireCustomer, requireShopRole } from "@/server/authz";
import { currentPrincipal } from "@/server/authz/principal";
import { env } from "@/server/env";
import { AppError, isAppError } from "@/server/errors";
import { ipLimit, limit, tooManyRequests, userKey } from "@/server/security/rate-limit";
import { assertReadOrigin, clientIp } from "@/server/security/request";
import { realtimeHub } from "./process-hub";
import { realtimeOffForTest } from "./test-switch";
import type { RealtimeTarget } from "./events";

/**
 * The SSE endpoints' shared logic (P1-10, ARCHITECTURE §7, SECURITY §3/§6):
 *   origin check → per-IP connect limit (before the session lookup) → authorisation → per-user connect limit →
 *   stream deadline from the user's roles → open on the process hub.
 * Connect limits fail **open** (a read-only hint; Redis down already degrades realtime), the in-process caps
 * still apply. Errors before the stream are JSON `{ error: { code, message } }` with the code's status.
 */
export const CONNECT_LIMITS = {
  ip: { max: 60, windowSec: 300 },
  user: { max: 30, windowSec: 300 },
} as const;

export type StreamRequest = { kind: "me" } | { kind: "shop"; shopId: string };

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-transform: no proxy (or Next's compression) may buffer or rewrite the stream.
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
} as const;

const errorResponse = (err: AppError, headers: Record<string, string> = {}): Response =>
  Response.json(
    { error: { code: err.code, message: err.message } },
    {
      status: err.status,
      headers: err.retryAfterSec
        ? { ...headers, "Retry-After": String(err.retryAfterSec) }
        : headers,
    },
  );

/** 503 for a process that is stopping or full: come back in 5–15 s (spread). */
const unavailable = (): Response =>
  errorResponse(
    new AppError("UNAVAILABLE", undefined, undefined, {
      retryAfterSec: 5 + Math.floor(Math.random() * 10),
    }),
  );

export async function openRealtimeStream(
  request: Request,
  which: StreamRequest,
): Promise<Response> {
  try {
    if (realtimeOffForTest(request.headers.get("cookie"), env().APP_ENV))
      throw new AppError("FORBIDDEN", "realtime off in this spec");
    assertReadOrigin(request);
    const ip = ipLimit("sse", clientIp(request.headers), CONNECT_LIMITS.ip);
    if (ip) {
      const r = await limit({ ...ip, onError: "open" });
      if (!r.ok) return tooManyRequests(r);
    }
    const principal = await currentPrincipal();
    let userId: string;
    let channel: RealtimeTarget;
    if (which.kind === "me") {
      userId = (await requireCustomer(principal)).userId;
      channel = { kind: "user", id: userId };
    } else {
      const shopId = parseShopId(which.shopId);
      if (!shopId) throw new AppError("FORBIDDEN");
      const scope = await requireShopRole(shopId, ALL_SHOP_ROLES, principal);
      userId = scope.userId;
      channel = { kind: "shop", id: scope.shopId };
    }
    const sessionId = principal?.sessionId;
    if (!principal || !sessionId) throw new AppError("UNAUTHENTICATED");
    const perUser = await limit({
      key: userKey("sse", userId),
      ...CONNECT_LIMITS.user,
      onError: "open",
    });
    if (!perUser.ok) return tooManyRequests(perUser);

    const deadline = await streamDeadline(userId, principal.sessionCreatedAt);
    const opened = realtimeHub().open({
      userId,
      sessionId,
      deadline,
      channel,
      signal: request.signal,
    });
    if (!opened.ok) return unavailable();
    return new Response(opened.stream, { status: 200, headers: SSE_HEADERS });
  } catch (err) {
    if (isAppError(err)) return errorResponse(err);
    throw err;
  }
}
