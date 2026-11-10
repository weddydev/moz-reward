import "server-only";
import { isIP } from "node:net";

/** IPv6 prefix that limits treat as one client (ISPs and hosts hand a whole /64 to one customer). */
export const IPV6_LIMIT_PREFIX = 64;

/**
 * The address a per-IP limit or lock keys on (P0-19, SECURITY §6). IPv4 as is; IPv6 collapsed to its /64, so
 * an attacker can't rotate through the 2^64 addresses of their own allocation to get fresh buckets;
 * IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is the IPv4 address. Anything else ("local", "unknown") is unchanged.
 */
export function ipBucket(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const lower = ip.toLowerCase().split("%")[0] ?? "";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (mapped?.[1]) return mapped[1];
  const compressed = lower.includes("::");
  const [head = "", tail = ""] = compressed ? lower.split("::") : [lower, ""];
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  // An embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4) fills two groups.
  const backGroups = back.reduce((n, g) => n + (g.includes(".") ? 2 : 1), 0);
  const groups = compressed
    ? [...front, ...Array<string>(Math.max(0, 8 - front.length - backGroups)).fill("0"), ...back]
    : front;
  const prefix = groups
    .slice(0, IPV6_LIMIT_PREFIX / 16)
    .map((g) => g.padStart(4, "0"))
    .join(":");
  return `${prefix}::/${String(IPV6_LIMIT_PREFIX)}`;
}
