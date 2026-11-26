import { randomBytes, randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { isPortalPath } from "@/features/portal/routes";
import { env } from "@/server/env";
import { securityHeaders } from "@/server/security/headers";
import { checkLandingLimit } from "@/server/security/landing-limit";
import { retryAfterSec } from "@/server/security/rate-limit";

/**
 * Proxy (Next 16's middleware; Node runtime) — P0-05, SECURITY §5.
 * - Per-request CSP nonce: set on the request (Next reads it while rendering and nonces its own scripts) and
 *   on the response, with the rest of the security headers.
 * - `x-request-id`: generated here (or kept from the trusted proxy when well-formed), forwarded to the app
 *   for log correlation and returned to the client.
 * - `/dev/*` answers a real 404 in production (a page-level notFound() would stream a 200).
 * - `x-pathname`: the request path, forwarded for the portal layout gate (P0-12).
 * - `Cache-Control: private, no-store` on portal paths (P0-12) and shop landing pages (P1-02).
 * - `Clear-Site-Data: "cache"` on the sign-out POST (P1-14, design check M3): defence in depth for the HTTP cache;
 *   the member card's Cache Storage entry is cleared by the page itself (SignOutButton, CardCacheGuard).
 * - `/s/<code>`: per-IP shop-lookup limit (P1-02, C-15) before any render, so a refused request never reaches
 *   the cache or the database; over the limit → a friendly 429 page with Retry-After.
 */
export const SIGN_OUT_PATH = "/api/auth/sign-out";

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

function requestId(request: NextRequest, trustedProxy: string): string {
  const incoming = request.headers.get("x-request-id");
  return trustedProxy !== "none" && incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/** True when the path's percent-escapes decode (a malformed one makes the framework fail with a 500). */
function decodes(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return true;
  } catch {
    return false;
  }
}

/** A shop landing path: `/s/<anything>` (the page decides whether it is a valid code). */
export const isLandingPath = (pathname: string): boolean => /^\/s\/[^/]+\/?$/.test(pathname);

function tooManyLookups(waitSec: number, nonce: string): NextResponse {
  const minutes = waitSec <= 60 ? "a minute" : `${String(Math.ceil(waitSec / 60))} minutes`;
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Too many shop lookups · Moz Rewards</title><style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#fffcf5;color:#2a2418;padding:16px}main{max-width:28rem;text-align:center}h1{font-size:1.5rem;margin:0 0 .5rem}</style></head><body><main><h1>Too many shop lookups</h1><p>You've looked up a lot of shops in a short time. Please try again in ${minutes}.</p></main></body></html>`;
  return new NextResponse(html, {
    status: 429,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": String(waitSec) },
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const e = env();
  const nonce = randomBytes(16).toString("base64");
  const headers = securityHeaders({
    nonce,
    appEnv: e.APP_ENV,
    isDev: process.env.NODE_ENV === "development",
    cdnUrl: e.CDN_URL,
    pathname: request.nextUrl.pathname,
  });
  const id = requestId(request, e.TRUSTED_PROXY);
  const { pathname } = request.nextUrl;

  const landing = isLandingPath(pathname);
  const lookup = landing ? await checkLandingLimit(request.headers) : null;

  let response: NextResponse;
  if (e.APP_ENV === "production" && (pathname === "/dev" || pathname.startsWith("/dev/"))) {
    response = new NextResponse("Not found", { status: 404 });
  } else if (landing && !decodes(pathname)) {
    response = new NextResponse("Bad request", { status: 400 });
  } else if (lookup && !lookup.ok) {
    response = tooManyLookups(retryAfterSec(lookup), nonce);
  } else {
    const forwarded = new Headers(request.headers);
    forwarded.set("x-nonce", nonce);
    forwarded.set("content-security-policy", headers["Content-Security-Policy"] ?? "");
    forwarded.set("x-request-id", id);
    // The page path for the group layout gate (src/server/portal/gate.ts): set here, so a client value is
    // overwritten. The layout only uses it to pick a route from the table (never as a returnTo).
    forwarded.set("x-pathname", pathname);
    response = NextResponse.next({ request: { headers: forwarded } });
  }
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  response.headers.set("x-request-id", id);
  // Portal pages are per-user (P0-12): never stored, whatever the framework would default to.
  // Shop landing HTML is never stored by a shared cache (ARCHITECTURE §5: only its public data is cached).
  if (isPortalPath(pathname) || landing) response.headers.set("Cache-Control", "private, no-store");
  if (pathname === SIGN_OUT_PATH && request.method === "POST") {
    response.headers.set("Clear-Site-Data", '"cache"');
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except build assets and the favicon; API routes included (request id, headers).
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // Shop landing pages also on prefetch requests: a prefetch header must not skip the lookup limit.
    "/s/:code",
  ],
};
