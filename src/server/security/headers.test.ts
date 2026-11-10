import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./headers";

const NONCE = "bm9uY2UtdGVzdA==";
const directives = (csp: string): Map<string, string> =>
  new Map(
    csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name = "", ...values] = d.split(/\s+/);
        return [name, values.join(" ")];
      }),
  );

describe("[P0-05] security headers (SECURITY §5)", () => {
  it("production header set (snapshot)", () => {
    expect(
      securityHeaders({
        nonce: NONCE,
        appEnv: "production",
        isDev: false,
        pathname: "/",
        cdnUrl: "https://cdn.mozrewards.co.uk",
      }),
    ).toMatchInlineSnapshot(`
      {
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'nonce-bm9uY2UtdGVzdA==' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.mozrewards.co.uk; font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Permissions-Policy": "camera=(), geolocation=(self), microphone=(), payment=(), usb=(), bluetooth=(), serial=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=()",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      }
    `);
  });

  it("scripts run only with the request nonce (no unsafe-inline, no host allowlist), plus strict-dynamic", () => {
    const d = directives(
      contentSecurityPolicy({ nonce: NONCE, appEnv: "production", isDev: false }),
    );
    expect(d.get("script-src")).toBe(`'self' 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
  });

  it("development adds only 'unsafe-eval' (React dev tooling); local/test don't upgrade http requests", () => {
    const d = directives(contentSecurityPolicy({ nonce: NONCE, appEnv: "local", isDev: true }));
    expect(d.get("script-src")).toBe(`'self' 'nonce-${NONCE}' 'strict-dynamic' 'unsafe-eval'`);
    expect(d.has("upgrade-insecure-requests")).toBe(false);
  });

  it("img-src includes the CDN origin only (not its path) and omits it when unset", () => {
    const withCdn = directives(
      contentSecurityPolicy({
        nonce: NONCE,
        appEnv: "staging",
        isDev: false,
        cdnUrl: "https://cdn.x.test/img/",
      }),
    );
    expect(withCdn.get("img-src")).toBe("'self' data: blob: https://cdn.x.test");
    const without = directives(
      contentSecurityPolicy({ nonce: NONCE, appEnv: "staging", isDev: false }),
    );
    expect(without.get("img-src")).toBe("'self' data: blob:");
  });

  it("camera is allowed only on scanner pages", () => {
    const camera = (pathname: string): string | undefined =>
      securityHeaders({ nonce: NONCE, appEnv: "production", isDev: false, pathname })
        ["Permissions-Policy"]?.split(", ")
        .find((p) => p.startsWith("camera="));
    expect(camera("/staff/scan")).toBe("camera=(self)");
    expect(camera("/scan")).toBe("camera=(self)");
    expect(camera("/staff/scan/anything")).toBe("camera=(self)");
    expect(camera("/scanner-lookalike")).toBe("camera=()");
    expect(camera("/wallet")).toBe("camera=()");
  });

  it("a nonce is required and must be base64", () => {
    expect(() =>
      contentSecurityPolicy({ nonce: "", appEnv: "production", isDev: false }),
    ).toThrow();
    expect(() =>
      contentSecurityPolicy({ nonce: "x'; script-src *", appEnv: "production", isDev: false }),
    ).toThrow();
  });
});
