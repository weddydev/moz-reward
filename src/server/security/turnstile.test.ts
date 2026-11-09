import { describe, expect, it, vi } from "vitest";
import { createTurnstileVerifier, TURNSTILE_BYPASS_TOKEN } from "./turnstile";

const SECRET = "0x4AAAAAAA-real-looking-secret";
type Call = { url: string; body: URLSearchParams };

function fakeFetch(reply: unknown, status = 200): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: url instanceof Request ? url.url : url.toString(),
      body: new URLSearchParams(init?.body as URLSearchParams),
    });
    return new Response(JSON.stringify(reply), { status });
  });
  return { fetch: impl, calls };
}

const verifier = (
  f: typeof fetch,
  over: Partial<Parameters<typeof createTurnstileVerifier>[0]> = {},
) =>
  createTurnstileVerifier({
    secret: SECRET,
    appEnv: "production",
    expectedHostname: "mozrewards.co.uk",
    fetch: f,
    ...over,
  });

describe("[P0-05] Turnstile verification (server)", () => {
  it("accepts a token Cloudflare confirms for our hostname, sending secret, token and client IP", async () => {
    const { fetch, calls } = fakeFetch({ success: true, hostname: "mozrewards.co.uk" });
    expect(await verifier(fetch)("tok-123", "203.0.113.7")).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(calls[0]?.body ?? [])).toEqual({
      secret: SECRET,
      response: "tok-123",
      remoteip: "203.0.113.7",
    });
  });

  it("does not send a placeholder IP (local/unknown)", async () => {
    const { fetch, calls } = fakeFetch({ success: true, hostname: "mozrewards.co.uk" });
    await verifier(fetch)("tok", "unknown");
    expect(calls[0]?.body.has("remoteip")).toBe(false);
  });

  it("rejects a failed, wrong-hostname, missing or oversized token", async () => {
    const failed = fakeFetch({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifier(failed.fetch)("tok", "1.2.3.4")).toEqual({
      ok: false,
      reason: "invalid-input-response",
    });
    const elsewhere = fakeFetch({ success: true, hostname: "evil.example" });
    expect(await verifier(elsewhere.fetch)("tok", "1.2.3.4")).toEqual({
      ok: false,
      reason: "hostname",
    });
    const never = fakeFetch({ success: true, hostname: "mozrewards.co.uk" });
    expect(await verifier(never.fetch)("", "1.2.3.4")).toEqual({ ok: false, reason: "missing" });
    expect(await verifier(never.fetch)(null, "1.2.3.4")).toEqual({ ok: false, reason: "missing" });
    expect(await verifier(never.fetch)("x".repeat(2049), "1.2.3.4")).toEqual({
      ok: false,
      reason: "too-long",
    });
    expect(never.calls).toHaveLength(0);
  });

  it("fails closed when Cloudflare errors or times out", async () => {
    const http500 = fakeFetch({}, 500);
    expect(await verifier(http500.fetch)("tok", "1.2.3.4")).toEqual({
      ok: false,
      reason: "http-500",
    });
    const timeout = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;
    expect(await verifier(timeout)("tok", "1.2.3.4")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("bypass exists only in local/test without a secret, and only for the bypass token", async () => {
    const { fetch, calls } = fakeFetch({ success: true });
    const local = verifier(fetch, { appEnv: "test", secret: undefined });
    expect(await local(TURNSTILE_BYPASS_TOKEN, "local")).toEqual({ ok: true });
    expect(await local("anything-else", "local")).toEqual({ ok: false, reason: "missing" });
    expect(calls).toHaveLength(0);
    // Staging/production never bypass, even when handed the bypass token.
    const prodWithoutSecret = verifier(fetch, { appEnv: "production", secret: undefined });
    expect(await prodWithoutSecret(TURNSTILE_BYPASS_TOKEN, "1.2.3.4")).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });

  it("refuses Cloudflare's public always-pass test secrets outside local/test", async () => {
    const { fetch } = fakeFetch({ success: true, hostname: "mozrewards.co.uk" });
    const withTestKey = verifier(fetch, { secret: "1x0000000000000000000000000000000AA" });
    expect(await withTestKey("tok", "1.2.3.4")).toEqual({ ok: false, reason: "not-configured" });
  });
});
