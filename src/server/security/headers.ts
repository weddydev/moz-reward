import "server-only";
import { permissionsPolicy, staticSecurityHeaders } from "@/lib/static-security-headers";

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

export { permissionsPolicy };

export function securityHeaders(input: HeaderInput & { pathname: string }): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(input),
    ...staticSecurityHeaders(input.pathname),
  };
}
