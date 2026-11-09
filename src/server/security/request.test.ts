import { describe, expect, it } from "vitest";
import { isAppError } from "@/server/errors";
import { assertSameOrigin, clientIp } from "./request";

const h = (init: Record<string, string>): Headers => new Headers(init);

describe("[P0-05] clientIp: only trusted proxy headers count", () => {
  it("no proxy (local/test): ignores X-Forwarded-For and CF-Connecting-IP entirely", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "7.7.7.7" });
    expect(clientIp(headers, "none")).toBe("local");
  });

  it("behind Caddy: takes the right-most X-Forwarded-For entry (the one Caddy saw), not client-supplied ones", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), "caddy")).toBe("203.0.113.7");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }), "caddy")).toBe("203.0.113.7");
    expect(
      clientIp(h({ "x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "7.7.7.7" }), "caddy"),
    ).toBe("6.6.6.6");
  });

  it("behind Cloudflare: uses CF-Connecting-IP and ignores X-Forwarded-For", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "2001:db8::1" });
    expect(clientIp(headers, "cloudflare")).toBe("2001:db8::1");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6" }), "cloudflare")).toBe("unknown");
  });

  it("rejects values that are not IP addresses (header injection, junk)", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, evil<script>" }), "caddy")).toBe("unknown");
    expect(clientIp(h({ "cf-connecting-ip": "999.1.1.1" }), "cloudflare")).toBe("unknown");
    expect(clientIp(h({}), "caddy")).toBe("unknown");
  });
});

describe("[P0-05] assertSameOrigin for mutating route handlers", () => {
  const APP = ["https://moz.example"];
  const req = (method: string, headers: Record<string, string>): Request =>
    new Request("https://moz.example/api/thing", { method, headers });
  const rejects = (r: Request): boolean => {
    try {
      assertSameOrigin(r, APP);
      return false;
    } catch (e) {
      return isAppError(e) && e.code === "FORBIDDEN";
    }
  };

  it("lets safe methods through without an Origin", () => {
    expect(rejects(req("GET", {}))).toBe(false);
    expect(rejects(req("HEAD", {}))).toBe(false);
    expect(rejects(req("OPTIONS", {}))).toBe(false);
  });

  it("accepts a mutating request from the app's own origin", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(rejects(req(m, { origin: "https://moz.example" }))).toBe(false);
    }
  });

  it("rejects other origins, lookalikes, scheme or port changes and the opaque 'null' origin", () => {
    for (const origin of [
      "https://evil.example",
      "https://moz.example.evil.example",
      "http://moz.example",
      "https://moz.example:8443",
      "null",
    ]) {
      expect(rejects(req("POST", { origin })), origin).toBe(true);
    }
  });

  it("without Origin, trusts only Sec-Fetch-Site: same-origin", () => {
    expect(rejects(req("POST", { "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(rejects(req("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(rejects(req("POST", { "sec-fetch-site": "same-site" }))).toBe(true);
    expect(rejects(req("POST", {}))).toBe(true);
  });
});
