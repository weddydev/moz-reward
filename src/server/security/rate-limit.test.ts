import { describe, expect, it } from "vitest";
import { humanWait, ipKey, ipLimit } from "./rate-limit";

describe("[P0-19] ipLimit: per-IP limit policy (SECURITY §6)", () => {
  const spec = { max: 20, windowSec: 3600 };

  it("a real address gets its own bucket with the full allowance", () => {
    expect(ipLimit("s", "203.0.113.7", spec)).toEqual({
      key: ipKey("s", "203.0.113.7"),
      max: 20,
      windowSec: 3600,
    });
  });

  it("'unknown' is one shared bucket with a quarter of the allowance (at least 1)", () => {
    expect(ipLimit("s", "unknown", spec)).toEqual({
      key: ipKey("s", "unknown"),
      max: 5,
      windowSec: 3600,
    });
    expect(ipLimit("s", "unknown", { max: 3, windowSec: 60 })?.max).toBe(1);
  });

  it("'local' (no trusted proxy; local/test only) skips the per-IP limit", () => {
    expect(ipLimit("s", "local", spec)).toBeNull();
  });
});

describe("[P0-19] humanWait: wait times read naturally", () => {
  it.each([
    [1, "a minute"],
    [60, "a minute"],
    [61, "2 minutes"],
    [59 * 60, "59 minutes"],
    [60 * 60, "an hour"],
    [60 * 60 + 1, "2 hours"],
  ])("%i s → %s", (sec, text) => {
    expect(humanWait(sec)).toBe(text);
  });
});

describe("[P0-19] per-IP keys collapse IPv6 to its /64", () => {
  it("addresses in one /64 share a limit; another /64 and IPv4 keep their own", () => {
    const key = ipKey("s", "2001:db8:1:2::1");
    expect(ipKey("s", "2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(key);
    expect(ipLimit("s", "2001:db8:1:2:ffff::9", { max: 5, windowSec: 60 })?.key).toBe(key);
    expect(ipKey("s", "2001:db8:1:3::1")).not.toBe(key);
    expect(ipKey("s", "203.0.113.7")).toBe("s:ip:203.0.113.7");
  });
});
