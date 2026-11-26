import "server-only";
import { requireCustomer } from "@/server/authz";
import { currentPrincipal } from "@/server/authz/principal";
import { isAppError } from "@/server/errors";
import { ipLimit, limit, tooManyRequests, userKey } from "@/server/security/rate-limit";
import { clientIp } from "@/server/security/request";
import { issueOwnMemberQr } from "./member-qr";

/**
 * `GET /api/me/member-qr` (P1-14): the signed-in customer's card payload. Never stored by any HTTP cache; the
 * service worker keeps one copy for the offline card (public/sw.js). Limits fail open: a token alone grants
 * nothing (design check). The card refetches every 4 minutes, so 60 an hour per user leaves room for a few tabs.
 */
export const MEMBER_QR_LIMITS = {
  ip: { max: 120, windowSec: 3600 },
  user: { max: 60, windowSec: 3600 },
} as const;

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

const error = (
  status: number,
  code: string,
  message: string,
  extra: Record<string, string> = {},
): Response =>
  Response.json({ error: { code, message } }, { status, headers: { ...NO_STORE, ...extra } });

export async function memberQrResponse(request: Request, now = Date.now()): Promise<Response> {
  try {
    const ip = ipLimit("member-qr", clientIp(request.headers), MEMBER_QR_LIMITS.ip);
    if (ip) {
      const r = await limit({ ...ip, onError: "open" });
      if (!r.ok) return tooManyRequests(r);
    }
    const scope = await requireCustomer(await currentPrincipal());
    const perUser = await limit({
      key: userKey("member-qr", scope.userId),
      ...MEMBER_QR_LIMITS.user,
      onError: "open",
    });
    if (!perUser.ok) return tooManyRequests(perUser);
    const payload = await issueOwnMemberQr(scope, now);
    if (!payload) return error(404, "NOT_FOUND", "You don't have a member card yet.");
    return Response.json(payload, { status: 200, headers: NO_STORE });
  } catch (err) {
    if (isAppError(err)) {
      const retry = err.retryAfterSec ? { "Retry-After": String(err.retryAfterSec) } : {};
      return error(err.status, err.code, err.message, retry);
    }
    throw err;
  }
}
