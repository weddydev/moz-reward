import "server-only";

/**
 * Security headers (P0-05, SECURITY §5), applied by `src/proxy.ts` to every page and route response.
 *
 * CSP: scripts run only with the per-request nonce (`'strict-dynamic'` lets a trusted script load the
 * chunks it needs, e.g. Next's runtime and Turnstile). Styles allow `'unsafe-inline'`: React renders
 * `style` attributes into the server HTML, which a style nonce can't cover; SECURITY §5 requires nonces for
 * scripts (DECISIONS 2026-11-09). `'unsafe-eval'` only in development (React dev tooling).
 */
export type HeaderInput = {
  nonce: string;
  appEnv: "local" | "test" | "staging" | "production";
  isDev: boolean;
  cdnUrl?: string | undefined;
};

/** Pages that may use the camera (member QR scanner, customer shop-code scan). */
const CAMERA_PATHS = ["/scan", "/staff/scan"] as const;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function contentSecurityPolicy({ nonce, appEnv, isDev, cdnUrl }: HeaderInput): string {
  if (!BASE64.test(nonce)) throw new Error("CSP nonce must be a non-empty base64 string");
  const cdn = cdnUrl ? ` ${new URL(cdnUrl).origin}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${cdn}`,
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // Locally the app runs on plain http; upgrading would break every sub-resource.
  if (appEnv === "staging" || appEnv === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

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

export function securityHeaders(input: HeaderInput & { pathname: string }): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(input),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": permissionsPolicy(input.pathname),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Browsers ignore HSTS over plain http, so sending it locally is harmless and keeps one code path.
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
  };
}
