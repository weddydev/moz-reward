import { describe, expect, it } from "vitest";
import { betterAuthIpOptions } from "./ip";

describe("[P0-07] Better Auth client IP follows TRUSTED_PROXY (security review #6)", () => {
  it("no proxy: no trustworthy IP, so none is tracked (X-Forwarded-For would be attacker-controlled)", () => {
    expect(betterAuthIpOptions("none")).toEqual({ disableIpTracking: true });
  });

  it("Caddy: the right-most X-Forwarded-For hop (Caddy appends the real client), loopback proxies skipped", () => {
    expect(betterAuthIpOptions("caddy")).toEqual({
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: ["127.0.0.1/32", "::1/128"],
    });
  });

  it("Cloudflare: CF-Connecting-IP only", () => {
    expect(betterAuthIpOptions("cloudflare")).toEqual({ ipAddressHeaders: ["cf-connecting-ip"] });
  });
});
