/**
 * The security headers that don't depend on the request (SECURITY §5). Shared by `src/proxy.ts` (every page and
 * route, with the nonce CSP added) and `next.config.ts` (prefetch requests, which the proxy skips — P0-19,
 * SEC-10). No `server-only`: next.config.ts loads outside the React server graph. No secrets here.
 */

/** Pages that may use the camera (member QR scanner, customer shop-code scan). */
export const CAMERA_PATHS = ["/scan", "/staff/scan"] as const;

export function permissionsPolicy(pathname: string): string {
  const camera = CAMERA_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return [
    camera ? "camera=(self)" : "camera=()",
    "geolocation=(self)",
    "microphone=()",
    "payment=()",
    "usb=()",
    "bluetooth=()",
    "serial=()",
    "hid=()",
    "midi=()",
    "magnetometer=()",
    "gyroscope=()",
    "accelerometer=()",
    "display-capture=()",
    "browsing-topics=()",
  ].join(", ");
}

export function staticSecurityHeaders(pathname: string): Record<string, string> {
  return {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": permissionsPolicy(pathname),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Browsers ignore HSTS over plain http, so sending it locally is harmless and keeps one code path.
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    // Same rule as CSP frame-ancestors 'none', for responses without our CSP (prefetches) and old browsers.
    "X-Frame-Options": "DENY",
  };
}
