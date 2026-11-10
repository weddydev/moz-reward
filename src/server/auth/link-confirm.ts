import "server-only";
import { safeReturnTo } from "@/lib/return-to";
import {
  CONFIRM_PAGE_PATH,
  type ConfirmRetry,
  DEFAULT_RETURN,
  LINK_EXPIRED_PATH,
  isTokenShaped,
} from "@/lib/sign-in-link";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { authRequestLimit } from "@/server/security/auth-limit";
import { assertSameOrigin } from "@/server/security/request";
import { getAuth } from "./auth";

/**
 * Sign-in links are confirmed by a POST (P0-19 AC3, SECURITY §2). Mail scanners and link previews fetch every
 * URL in an email with GET; if that GET consumed the token, the customer's own click would fail. So:
 *
 * 1. The email links to our page `/sign-in/confirm?token=…&returnTo=…`, which only renders a "Sign in" button
 *    (a plain HTML form: it works before hydration and without JavaScript).
 * 2. The button POSTs to `/api/sign-in/confirm` (this module): same-origin check, the blanket auth limit, then
 *    Better Auth's own verify endpoint is called through its handler — same token checks, session creation,
 *    staff/admin refusal and cookies as before.
 * 3. The library's public `GET /api/auth/magic-link/verify` answers 404 (routes.ts INTERNAL_AUTH_ROUTES).
 */
/** POST /api/sign-in/confirm. Always answers with a 303 to a page (or 403 for a cross-site post). */
export async function confirmSignInLink(request: Request): Promise<Response> {
  const appUrl = env().APP_URL;
  try {
    assertSameOrigin(request);
  } catch {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  const returnTo = safeReturnTo(
    typeof form?.get("returnTo") === "string" ? (form.get("returnTo") as string) : null,
    DEFAULT_RETURN,
  );
  if (!isTokenShaped(token)) return seeOther(appUrl, LINK_EXPIRED_PATH);

  const limited = await authRequestLimit(request, "/sign-in/confirm");
  if (limited) {
    const retry: ConfirmRetry = limited.status === 503 ? "unavailable" : "busy";
    const back = new URL(CONFIRM_PAGE_PATH, appUrl);
    back.searchParams.set("token", token);
    if (returnTo !== DEFAULT_RETURN) back.searchParams.set("returnTo", returnTo);
    back.searchParams.set("retry", retry);
    return seeOther(appUrl, `${back.pathname}${back.search}`, {
      "Retry-After": limited.headers.get("retry-after") ?? "60",
    });
  }

  const verify = new URL("/api/auth/magic-link/verify", appUrl);
  verify.searchParams.set("token", token);
  verify.searchParams.set("callbackURL", returnTo);
  verify.searchParams.set("errorCallbackURL", LINK_EXPIRED_PATH);
  // The caller's headers (client IP, user agent, origin, existing cookies) so the session row and the
  // library's checks see the real request.
  const headers = new Headers(request.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  const res = await getAuth().handler(new Request(verify, { method: "GET", headers }));

  let target: string;
  if (res.status === 302) {
    target = sameOriginPath(res.headers.get("location"), appUrl) ?? LINK_EXPIRED_PATH;
  } else if (res.status === 403) {
    // Staff/admin accounts are refused a link session (session.create.before hook).
    target = `${LINK_EXPIRED_PATH}?error=FORBIDDEN`;
  } else {
    log().warn({ status: res.status }, "sign-in link verify answered unexpectedly");
    target = LINK_EXPIRED_PATH;
  }
  const out = seeOther(appUrl, target);
  for (const cookie of res.headers.getSetCookie()) out.headers.append("Set-Cookie", cookie);
  return out;
}

function sameOriginPath(location: string | null, appUrl: string): string | null {
  if (!location) return null;
  try {
    const url = new URL(location, appUrl);
    return url.origin === new URL(appUrl).origin ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

function seeOther(appUrl: string, path: string, extra: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: new URL(path, appUrl).toString(), "Cache-Control": "no-store", ...extra },
  });
}
