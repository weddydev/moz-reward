import "server-only";
import { isIP } from "node:net";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";

/**
 * Request helpers (P0-05, SECURITY §5–6).
 *
 * `clientIp`: the only IP sources trusted are the ones our own proxy sets. Without a proxy (local/test) a
 * client could put anything in X-Forwarded-For (Next keeps a client-supplied one), so every request shares
 * one "local" bucket. Behind Caddy, Caddy replaces untrusted X-Forwarded-* headers and the right-most entry
 * is the address Caddy saw. Behind Cloudflare, CF-Connecting-IP is used; the origin must accept traffic from
 * Cloudflare only (Caddy config, P0-15), or that header could be forged too.
 */
export type TrustedProxy = "none" | "caddy" | "cloudflare";

/** "unknown" is a strict shared bucket for limits, never a bypass (`ipLimit` in rate-limit.ts). */
const valid = (ip: string | undefined): string => (ip && isIP(ip) ? ip : "unknown");

export function clientIp(headers: Headers, trusted: TrustedProxy = env().TRUSTED_PROXY): string {
  switch (trusted) {
    case "none":
      return "local";
    case "caddy":
      return valid(headers.get("x-forwarded-for")?.split(",").at(-1)?.trim());
    case "cloudflare":
      return valid(headers.get("cf-connecting-ip")?.trim());
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF check for route handlers that change state (Server Actions have Next's own origin check). Requires
 * the Origin header to equal one of the app's origins exactly; without Origin, only a browser-set
 * `Sec-Fetch-Site: same-origin` is accepted. Throws FORBIDDEN otherwise.
 */
export function assertSameOrigin(
  request: Request,
  allowed: readonly string[] = [new URL(env().APP_URL).origin],
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  const ok =
    origin !== null
      ? allowed.includes(origin)
      : request.headers.get("sec-fetch-site") === "same-origin";
  if (!ok) throw new AppError("FORBIDDEN", "This request was blocked for your security.");
}
