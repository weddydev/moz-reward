import "server-only";
import type { TrustedProxy } from "@/server/security/request";

/**
 * Better Auth reads the client IP itself (session rows, its own limiter). By default it trusts a
 * single-value X-Forwarded-For, which a client can set. Align it with `clientIp()` (TRUSTED_PROXY):
 * no proxy → no IP; Caddy → right-most X-Forwarded-For hop; Cloudflare → CF-Connecting-IP.
 */
export type BetterAuthIpOptions =
  { disableIpTracking: true } | { ipAddressHeaders: string[]; trustedProxies?: string[] };

export function betterAuthIpOptions(trusted: TrustedProxy): BetterAuthIpOptions {
  switch (trusted) {
    case "none":
      return { disableIpTracking: true };
    case "caddy":
      return { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: ["127.0.0.1/32", "::1/128"] };
    case "cloudflare":
      return { ipAddressHeaders: ["cf-connecting-ip"] };
  }
}
