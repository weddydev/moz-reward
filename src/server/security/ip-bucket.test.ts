import { describe, expect, it } from "vitest";
import { ipBucket } from "./ip-bucket";

describe("[P0-19] ipBucket: per-IP limits key IPv6 by its /64", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["2001:db8:1:2:3:4:5:6", "2001:0db8:0001:0002::/64"],
    ["2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:0db8:0001:0002::/64"],
    ["2001:DB8:1:2::9", "2001:0db8:0001:0002::/64"],
    ["2001:db8::1", "2001:0db8:0000:0000::/64"],
    ["::1", "0000:0000:0000:0000::/64"],
    ["fe80::1%eth0", "fe80:0000:0000:0000::/64"],
    ["::ffff:198.51.100.4", "198.51.100.4"],
    ["64:ff9b::192.0.2.1", "0064:ff9b:0000:0000::/64"],
    ["local", "local"],
    ["unknown", "unknown"],
  ])("%s → %s", (ip, bucket) => {
    expect(ipBucket(ip)).toBe(bucket);
  });

  it("every address inside one /64 shares a bucket; the neighbouring /64 does not", () => {
    const a = ipBucket("2001:db8:aaaa:1::1");
    expect(ipBucket("2001:db8:aaaa:1:dead:beef:0:1")).toBe(a);
    expect(ipBucket("2001:db8:aaaa:2::1")).not.toBe(a);
  });
});
