import "server-only";
import { BlockList, isIP } from "node:net";

/**
 * Admin IP allowlist (P0-12, CARRIED C-24; SECURITY §2 "optional IP allowlist via env").
 *
 * `ADMIN_IP_ALLOWLIST` is a comma-separated list of addresses and CIDR ranges, IPv4 or IPv6. Unset means no
 * restriction. Anything else must parse completely or the boot fails: a typo must never turn into "nobody"
 * or "everybody" silently. A `/0` range is refused for the same reason (it is "everybody").
 *
 * Matching is on the exact address. `ipBucket` is not used here: it collapses IPv6 to a /64 for rate limits,
 * which would let a whole network segment through on one listed address.
 */
export type AdminAllowlist = { readonly check: (ip: ExactIp) => boolean };
export type ExactIp = { address: string; family: "ipv4" | "ipv6" };

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
/** Bits of an IPv4-mapped IPv6 address that come before the embedded IPv4 address. */
const MAPPED_PREFIX_BITS = 96;

/**
 * The one form an address is compared in: IPv4 as is, IPv4-mapped IPv6 (`::ffff:a.b.c.d`) as that IPv4
 * address, other IPv6 lower-cased. Null for anything that is not a plain address (the "local" / "unknown"
 * placeholders of `clientIp`, zone ids, header junk).
 */
export function exactIp(ip: string): ExactIp | null {
  const version = isIP(ip);
  if (version === 4) return { address: ip, family: "ipv4" };
  if (version !== 6 || ip.includes("%")) return null;
  const mapped = MAPPED_IPV4.exec(ip)?.[1];
  if (mapped) return isIP(mapped) === 4 ? { address: mapped, family: "ipv4" } : null;
  return { address: ip.toLowerCase(), family: "ipv6" };
}

type Parsed = { ok: true; list: AdminAllowlist | null } | { ok: false; error: string };

/** Parses the env value. Errors name the entry's position, never its text (env errors carry no values). */
export function parseAdminAllowlist(raw: string | undefined): Parsed {
  if (raw === undefined) return { ok: true, list: null };
  const entries = raw.split(",").map((e) => e.trim());
  const blocks = new BlockList();
  for (const [index, entry] of entries.entries()) {
    const bad = (why: string): Parsed => ({
      ok: false,
      error: `entry ${String(index + 1)} ${why}`,
    });
    if (entry === "") return bad("is empty");
    const parts = entry.split("/");
    const [addressText = "", prefixText] = parts;
    if (parts.length > 2) return bad("has more than one prefix");
    const exact = exactIp(addressText);
    if (!exact) return bad("is not an IPv4 or IPv6 address or range");
    if (prefixText === undefined) {
      blocks.addAddress(exact.address, exact.family);
      continue;
    }
    if (!/^\d{1,3}$/.test(prefixText)) return bad("has a prefix that is not a number");
    // A range written in mapped form (`::ffff:a.b.c.d/120`) is the IPv4 range with 96 bits fewer.
    const wasMapped = exact.family === "ipv4" && isIP(addressText) === 6;
    const prefix = Number(prefixText) - (wasMapped ? MAPPED_PREFIX_BITS : 0);
    const max = exact.family === "ipv4" ? 32 : 128;
    if (prefix > max) return bad("has a prefix longer than its address");
    if (prefix < 1) return bad("has a prefix that would let every address in");
    blocks.addSubnet(exact.address, prefix, exact.family);
  }
  return { ok: true, list: { check: (ip) => blocks.check(ip.address, ip.family) } };
}

/**
 * True when there is no list, or the address is on it. With a list, an address that can't be read as a plain
 * IP ("local" without a trusted proxy, "unknown", anything malformed) is refused: fail closed.
 */
export function adminAddressAllowed(list: AdminAllowlist | null, ip: string): boolean {
  if (!list) return true;
  const exact = exactIp(ip);
  return exact !== null && list.check(exact);
}
