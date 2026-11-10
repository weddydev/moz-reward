import "server-only";
import { IPV6_LIMIT_PREFIX } from "@/server/security/ip-bucket";
import type { TrustedProxy } from "@/server/security/request";

/**
 * Better Auth reads the client IP itself (session rows, its own limiter). By default it trusts a
 * single-value X-Forwarded-For, which a client can set. Align it with `clientIp()` (TRUSTED_PROXY):
 * no proxy → no IP; Caddy → right-most X-Forwarded-For hop; Cloudflare → CF-Connecting-IP. IPv6 is recorded as
 * its /64 (set explicitly; the library default), the same unit our limits key on (ip-bucket.ts).
 */
export type BetterAuthIpOptions =
  | { disableIpTracking: true }
  | { ipAddressHeaders: string[]; trustedProxies?: string[]; ipv6Subnet: number };

export function betterAuthIpOptions(trusted: TrustedProxy): BetterAuthIpOptions {
  switch (trusted) {
    case "none":
      return { disableIpTracking: true };
    case "caddy":
      return {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: ["127.0.0.1/32", "::1/128"],
        ipv6Subnet: IPV6_LIMIT_PREFIX,
      };
    case "cloudflare":
      return { ipAddressHeaders: ["cf-connecting-ip"], ipv6Subnet: IPV6_LIMIT_PREFIX };
  }
}
