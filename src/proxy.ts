import { randomBytes, randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/server/env";
import { securityHeaders } from "@/server/security/headers";

/**
 * Proxy (Next 16's middleware; Node runtime) — P0-05, SECURITY §5.
 * - Per-request CSP nonce: set on the request (Next reads it while rendering and nonces its own scripts) and
 *   on the response, with the rest of the security headers.
 * - `x-request-id`: generated here (or kept from the trusted proxy when well-formed), forwarded to the app
 *   for log correlation and returned to the client.
 * - `/dev/*` answers a real 404 in production (a page-level notFound() would stream a 200).
 * - `x-pathname`: the request path, forwarded for the portal layout gate (P0-12).
 */
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

function requestId(request: NextRequest, trustedProxy: string): string {
  const incoming = request.headers.get("x-request-id");
  return trustedProxy !== "none" && incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

export function proxy(request: NextRequest): NextResponse {
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

  let response: NextResponse;
  if (e.APP_ENV === "production" && (pathname === "/dev" || pathname.startsWith("/dev/"))) {
    response = new NextResponse("Not found", { status: 404 });
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
  ],
};
