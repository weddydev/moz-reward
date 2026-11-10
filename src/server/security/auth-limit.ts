import "server-only";
import { env } from "@/server/env";
import { log } from "@/server/log";
import {
  type LimitOptions,
  type LimitResult,
  UNKNOWN_IP,
  humanWait,
  ipLimit,
  limit,
  retryAfterSec,
} from "./rate-limit";
import { type TrustedProxy, clientIp } from "./request";

/**
 * Blanket per-IP limit on every `/api/auth/*` request (P0-19, SECURITY §6), in front of the reviewed route
 * allowlist and on top of the per-route limits (magic link, staff login, second factor). Generous on purpose:
 * a café's Wi-Fi puts many customers behind one address, and the per-route limits guard the sensitive
 * endpoints. It stops floods of the endpoints that have no limit of their own.
 *
 * Redis down: fails CLOSED with a friendly 503 + Retry-After (auth is abuse-sensitive), except sign-out —
 * leaving must always work.
 */
export const AUTH_BLANKET_LIMIT = { max: 100, windowSec: 60 } as const;

const FAIL_OPEN_PATHS: ReadonlySet<string> = new Set(["/sign-out"]);

export type AuthLimitDeps = {
  trusted?: TrustedProxy;
  limiter?: (opts: LimitOptions) => Promise<LimitResult>;
  /** Tests only: an isolated bucket and a small allowance. */
  scope?: string;
  spec?: { max: number; windowSec: number };
};

/**
 * Returns the response to send instead of Better Auth's (429 or 503), or null to continue. `path` is the
 * part after `/api/auth`. The body uses Better Auth's error shape (`{ code, message }`) so the auth client
 * shows the message.
 */
export async function authRequestLimit(
  request: Request,
  path: string,
  deps: AuthLimitDeps = {},
): Promise<Response | null> {
  const ip = clientIp(request.headers, deps.trusted ?? env().TRUSTED_PROXY);
  const opts = ipLimit(deps.scope ?? "auth", ip, deps.spec ?? AUTH_BLANKET_LIMIT);
  if (!opts) return null;
  if (ip === UNKNOWN_IP) {
    log().warn(
      { path },
      "auth request without a client IP: strict shared bucket (check the proxy)",
    );
  }
  const result = await (deps.limiter ?? limit)({
    ...opts,
    onError: FAIL_OPEN_PATHS.has(path) ? "open" : "closed",
  });
  if (result.ok) return null;
  const wait = retryAfterSec(result);
  return result.degraded
    ? authError(
        503,
        "SERVICE_UNAVAILABLE",
        "Sign-in is briefly unavailable. Please try again in a minute.",
        wait,
      )
    : authError(
        429,
        "TOO_MANY_REQUESTS",
        `Too many attempts. Please try again in ${humanWait(wait)}.`,
        wait,
      );
}

function authError(status: number, code: string, message: string, retryAfter: number): Response {
  return Response.json(
    { code, message },
    { status, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}
