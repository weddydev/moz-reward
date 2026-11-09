import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function run(
  path: string,
  headers: Record<string, string> = {},
): Promise<{ res: Response; forwarded: (name: string) => string | null }> {
  const { proxy } = await import("./proxy");
  const res = proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
  // NextResponse.next({ request: { headers } }) forwards overridden request headers this way.
  const forwarded = (name: string): string | null =>
    res.headers.get(`x-middleware-request-${name}`);
  return { res, forwarded };
}

describe("[P0-05] proxy: CSP nonce, security headers, request id, /dev gate", () => {
  it("sets every SECURITY §5 header with a fresh nonce per request, shared with the renderer", async () => {
    const a = await run("/");
    const b = await run("/");
    const csp = a.res.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
    expect(nonce).toBeDefined();
    expect(a.forwarded("x-nonce")).toBe(nonce);
    // Next reads the nonce from the request CSP header while rendering.
    expect(a.forwarded("content-security-policy")).toBe(csp);
    expect(b.res.headers.get("content-security-policy")).not.toBe(csp);
    for (const header of [
      "strict-transport-security",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
      "cross-origin-opener-policy",
    ]) {
      expect(a.res.headers.get(header), header).toBeTruthy();
    }
  });

  it("generates a request id, returns it and forwards it to the app", async () => {
    const { res, forwarded } = await run("/sign-in");
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(forwarded("x-request-id")).toBe(id);
  });

  it("ignores a client-supplied request id without a trusted proxy (log correlation can't be forged)", async () => {
    const { res } = await run("/", { "x-request-id": "attacker-chosen-id-123" });
    expect(res.headers.get("x-request-id")).not.toBe("attacker-chosen-id-123");
  });

  it("keeps a well-formed request id set by the trusted proxy, rejects a malformed one", async () => {
    vi.stubEnv("TRUSTED_PROXY", "caddy");
    expect(
      (await run("/", { "x-request-id": "caddy-abc-12345" })).res.headers.get("x-request-id"),
    ).toBe("caddy-abc-12345");
    vi.resetModules();
    expect(
      (await run("/", { "x-request-id": `bad id ${"x".repeat(80)}` })).res.headers.get(
        "x-request-id",
      ),
    ).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("/dev/* is a real 404 in production (with headers), and served elsewhere", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("APP_URL", "https://mozrewards.co.uk");
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("EMAIL_API_KEY", "re_test_key");
    vi.stubEnv("TRUSTED_PROXY", "cloudflare");
    for (const path of ["/dev", "/dev/ui", "/dev/guard-check?x=1"]) {
      const { res } = await run(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("content-security-policy")).toBeTruthy();
    }
    expect((await run("/developers")).res.status).toBe(200);
    vi.unstubAllEnvs();
    vi.resetModules();
    expect((await run("/dev/ui")).res.status).toBe(200);
  });

  it("matcher skips static assets and router prefetches", async () => {
    const { config } = await import("./proxy");
    const [matcher] = config.matcher;
    expect(matcher?.source).toContain("_next/static");
    expect(matcher?.missing.map((m) => m.key)).toEqual(["next-router-prefetch", "purpose"]);
  });
});
