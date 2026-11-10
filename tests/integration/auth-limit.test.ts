import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import * as route from "@/app/api/auth/[...all]/route";
import { newId } from "@/lib/id";
import { AUTH_BLANKET_LIMIT, authRequestLimit } from "@/server/security/auth-limit";
import { createLimiter, ipKey, limiterKey, limiterRedis } from "@/server/security/rate-limit";

const ORIGIN = "http://localhost:3000";
const SPEC = { max: 8, windowSec: 60 };

const req = (path: string, headers: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}/api/auth${path}`, { method: "POST", headers });
/** Behind Caddy the right-most X-Forwarded-For hop is the address Caddy saw. */
const viaCaddy = (ip: string, spoofed?: string) => ({
  "x-forwarded-for": spoofed ? `${spoofed}, ${ip}` : ip,
});
/** Unique per call (IPv6 documentation range, random /64: limits key IPv6 by its /64): limiter state outlives a test run. */
const freshIp = (): string => `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`;

async function run(n: number, make: () => Request, scope: string, path = "/sign-in/email") {
  const out: Array<Response | null> = [];
  for (let i = 0; i < n; i++)
    out.push(await authRequestLimit(make(), path, { trusted: "caddy", scope, spec: SPEC }));
  return out;
}

const down = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});

afterAll(() => {
  down.disconnect();
});

describe("[P0-19] blanket per-IP limit on /api/auth/* (SECURITY §6)", () => {
  it("allows the allowance per IP, then 429 with Retry-After in Better Auth's error shape", async () => {
    const scope = `t-auth-${newId()}`;
    const ip = freshIp();
    const results = await run(SPEC.max + 1, () => req("/sign-in/email", viaCaddy(ip)), scope);
    expect(results.slice(0, SPEC.max).every((r) => r === null)).toBe(true);
    const blocked = results.at(-1);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked?.headers.get("cache-control")).toBe("no-store");
    expect(await blocked?.json()).toEqual({
      code: "TOO_MANY_REQUESTS",
      message: "Too many attempts. Please try again in a minute.",
    });
  });

  it("buckets are per IP: another address is unaffected", async () => {
    const scope = `t-auth-${newId()}`;
    const [a, b] = [freshIp(), freshIp()];
    const blockedA = await run(SPEC.max + 1, () => req("/x", viaCaddy(a)), scope);
    expect(blockedA.at(-1)?.status).toBe(429);
    const [fromB] = await run(1, () => req("/x", viaCaddy(b)), scope);
    expect(fromB).toBeNull();
  });

  it("a spoofed X-Forwarded-For prefix does not escape the bucket (right-most hop is used)", async () => {
    const scope = `t-auth-${newId()}`;
    const ip = freshIp();
    const results = await run(
      SPEC.max + 1,
      () => req("/x", viaCaddy(ip, freshIp())), // a new forged client address every time
      scope,
    );
    expect(results.at(-1)?.status).toBe(429);
  });

  it("an unknown client IP is one strict shared bucket in deployed modes, never a bypass", async () => {
    const scope = `t-auth-${newId()}`;
    const strict = SPEC.max / 4;
    // No header, an empty one and garbage all resolve to "unknown" and share the bucket.
    const variants: Array<Record<string, string>> = [
      {},
      { "x-forwarded-for": "" },
      viaCaddy("not-an-ip"),
    ];
    const results = [];
    for (let i = 0; i < strict + 1; i++)
      results.push(
        await authRequestLimit(req("/x", variants[i % variants.length]), "/x", {
          trusted: "caddy",
          scope,
          spec: SPEC,
        }),
      );
    expect(results.slice(0, strict).every((r) => r === null)).toBe(true);
    expect(results.at(-1)?.status).toBe(429);
    const unknownKey = limiterKey(ipKey(scope, "unknown"));
    expect(await limiterRedis().zcard(unknownKey)).toBe(strict);
  });

  it("Redis unreachable: fails closed with a friendly 503 + Retry-After; sign-out still works", async () => {
    const limiter = createLimiter(down);
    const deps = { trusted: "caddy" as const, limiter, scope: `t-auth-${newId()}`, spec: SPEC };
    const res = await authRequestLimit(
      req("/sign-in/email", viaCaddy(freshIp())),
      "/sign-in/email",
      deps,
    );
    expect(res?.status).toBe(503);
    expect(Number(res?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res?.json()).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "Sign-in is briefly unavailable. Please try again in a minute.",
    });
    expect(
      await authRequestLimit(req("/sign-out", viaCaddy(freshIp())), "/sign-out", deps),
    ).toBeNull();
  });

  it("no trusted proxy (local/test only — env refuses it when deployed): no per-IP limit", async () => {
    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(
        await authRequestLimit(req("/x", viaCaddy(freshIp())), "/x", {
          trusted: "none",
          spec: { max: 1, windowSec: 60 },
          scope: `t-auth-${newId()}`,
        }),
      );
    expect(results).toEqual([null, null, null]);
  });

  it("the production allowance is generous enough for shared café Wi-Fi", () => {
    expect(AUTH_BLANKET_LIMIT).toEqual({ max: 100, windowSec: 60 });
  });

  it("the route handler applies the limit before the allowlist (unknown paths count too)", async () => {
    // Integration env runs with TRUSTED_PROXY=none, so the route path is exercised end to end here and the
    // 429 over HTTP on a production build is the conformance test's job (AC1, step I).
    const res = await route.POST(req("/definitely-not-a-route", { origin: ORIGIN }));
    expect(res.status).toBe(404);
  });
});
