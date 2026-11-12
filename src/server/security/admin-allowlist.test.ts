import { describe, expect, it } from "vitest";
import { adminAddressAllowed, exactIp, parseAdminAllowlist } from "./admin-allowlist";

const list = (raw: string) => {
  const parsed = parseAdminAllowlist(raw);
  if (!parsed.ok) throw new Error(`expected a valid list: ${parsed.error}`);
  return parsed.list;
};

describe("[P0-12] C-24 admin IP allowlist: parsing (a bad value fails the boot)", () => {
  it("unset means no restriction", () => {
    expect(parseAdminAllowlist(undefined)).toEqual({ ok: true, list: null });
  });

  it.each([
    ["blank", " "],
    ["only separators", " , ,"],
    ["an empty entry between two good ones", "203.0.113.7,,198.51.100.0/24"],
    ["not an address", "office"],
    ["a host name", "vpn.example.com"],
    ["an IPv4 with a port", "203.0.113.7:443"],
    ["a /0 IPv4 prefix (everyone)", "0.0.0.0/0"],
    ["a /0 IPv6 prefix (everyone)", "::/0"],
    ["a prefix past 32 for IPv4", "203.0.113.0/33"],
    ["a prefix past 128 for IPv6", "2001:db8::/129"],
    ["a non-numeric prefix", "203.0.113.0/24x"],
    ["a negative prefix", "203.0.113.0/-1"],
    ["an empty prefix", "203.0.113.0/"],
    ["two slashes", "203.0.113.0/24/8"],
    ["an IPv6 zone id", "fe80::1%eth0"],
    ["a mapped IPv4 with a prefix that reaches outside the mapped range", "::ffff:203.0.113.0/64"],
  ])("refuses %s", (_name, raw) => {
    const parsed = parseAdminAllowlist(raw);
    expect(parsed.ok).toBe(false);
    // Names the problem without echoing the configured value (env errors list names only).
    const entries = raw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (!parsed.ok) for (const entry of entries) expect(parsed.error).not.toContain(entry);
  });

  it("accepts addresses and CIDRs of both families, with spaces around entries", () => {
    expect(list(" 203.0.113.7 , 198.51.100.0/24,2001:db8:1::/48, 2001:db8:2::9 ")).not.toBeNull();
  });
});

describe("[P0-12] C-24 admin IP allowlist: matching", () => {
  const l = list("203.0.113.7,198.51.100.0/24,2001:db8:1::/48,2001:db8:2::9,::ffff:192.0.2.0/120");

  it.each([
    ["the exact IPv4", "203.0.113.7"],
    ["an address inside the IPv4 range", "198.51.100.200"],
    ["the first and last address of the range", "198.51.100.0"],
    ["the last address of the range", "198.51.100.255"],
    ["an IPv4-mapped IPv6 form of a listed IPv4", "::ffff:203.0.113.7"],
    ["the same in upper case", "::FFFF:203.0.113.7"],
    ["an address inside the IPv6 range", "2001:db8:1:ffff::1"],
    ["the exact IPv6, written differently", "2001:0DB8:0002:0000:0000:0000:0000:0009"],
    ["an IPv4 inside a range that was listed in mapped form", "192.0.2.77"],
  ])("allows %s", (_name, ip) => {
    expect(adminAddressAllowed(l, ip)).toBe(true);
  });

  it.each([
    ["the next IPv4", "203.0.113.8"],
    ["an address just outside the IPv4 range", "198.51.101.0"],
    ["an address just outside the IPv6 range", "2001:db8:2::1"],
    // Exact match, not the /64 bucket the rate limits use.
    ["another address in the same /64 as a listed IPv6", "2001:db8:2::a"],
    ["the no-proxy placeholder", "local"],
    ["an unreadable address", "unknown"],
    ["an empty string", ""],
    ["a listed address with a zone id", "203.0.113.7%eth0"],
    ["a listed address with trailing text", "203.0.113.7 "],
    ["a comma-joined header value", "203.0.113.7, 10.0.0.1"],
  ])("refuses %s", (_name, ip) => {
    expect(adminAddressAllowed(l, ip)).toBe(false);
  });

  it("with no list, every address passes, placeholders included", () => {
    for (const ip of ["203.0.113.8", "local", "unknown", ""])
      expect(adminAddressAllowed(null, ip)).toBe(true);
  });
});

describe("[P0-12] exactIp: one comparable form per address", () => {
  it.each([
    ["203.0.113.7", { address: "203.0.113.7", family: "ipv4" }],
    ["::ffff:203.0.113.7", { address: "203.0.113.7", family: "ipv4" }],
    ["::FFFF:203.0.113.7", { address: "203.0.113.7", family: "ipv4" }],
    ["2001:DB8::1", { address: "2001:db8::1", family: "ipv6" }],
    ["local", null],
    ["unknown", null],
    ["fe80::1%eth0", null],
    ["999.1.1.1", null],
  ])("%s", (ip, expected) => {
    expect(exactIp(ip)).toEqual(expected);
  });
});
