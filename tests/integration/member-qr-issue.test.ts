import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as memberQrRoute } from "@/app/api/me/member-qr/route";
import { formatMemberId } from "@/lib/codes";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { AppError } from "@/server/errors";
import { MEMBER_QR_LIFETIME_MS, memberQrKeys, verifyMemberQr } from "@/server/security/member-qr";
import { ipLimit, limit, userKey } from "@/server/security/rate-limit";
import type * as RequestModule from "@/server/security/request";
import type * as MemberQrModule from "@/server/services/member-qr";
import { CARD_CACHE_MS, cardOwnerTag } from "@/server/services/member-qr";
import { MEMBER_QR_LIMITS } from "@/server/services/member-qr-route";
import { makeCustomerProfile, makeUser } from "@/server/testing/factories";

/**
 * P1-14: `GET /api/me/member-qr`, the real route handler signed in as real customers. The client address is read
 * as behind Caddy (X-Forwarded-For) so the per-IP limit is live; each test uses its own address.
 */
vi.mock("@/server/security/request", async (importOriginal) => {
  const actual = await importOriginal<typeof RequestModule>();
  return { ...actual, clientIp: (headers: Headers) => actual.clientIp(headers, "caddy") };
});
const fault = vi.hoisted(() => ({ error: undefined as Error | undefined }));
vi.mock("@/server/services/member-qr", async (importOriginal) => {
  const actual = await importOriginal<typeof MemberQrModule>();
  return {
    ...actual,
    issueOwnMemberQr: (...args: Parameters<typeof actual.issueOwnMemberQr>) => {
      if (fault.error) throw fault.error;
      return actual.issueOwnMemberQr(...args);
    },
  };
});

afterEach(() => {
  fault.error = undefined;
});

let ipSeq = 0;
const freshIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`;

async function customer(fullName: string) {
  const user = await makeUser();
  const profile = await makeCustomerProfile(user.id, { fullName });
  const principal = await loadPrincipal({
    userId: user.id,
    mfaVerified: true,
    sessionCreatedAt: new Date(),
  });
  return { userId: user.id, memberId: profile.memberId, principal };
}

const get = (as: Awaited<ReturnType<typeof customer>>["principal"], ip: string) =>
  runAsPrincipal(as, () =>
    memberQrRoute(
      new Request("http://localhost:3100/api/me/member-qr", {
        headers: { "x-forwarded-for": ip },
      }),
    ),
  );

async function spend(spec: { key: string; max: number; windowSec: number }) {
  for (let i = 0; i < spec.max; i++) await limit({ ...spec, onError: "closed" });
}

describe("[P1-14] GET /api/me/member-qr", () => {
  it("[P1-14] a customer with a card gets a fresh token, first name only, a day's cache window and a no-store answer", async () => {
    const ana = await customer("Ana Maria Pereira");
    const before = Date.now();
    const res = await get(ana.principal, freshIp());
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = (await res.json()) as Record<string, unknown> & {
      token: string;
      serverNow: number;
      expiresAt: number;
      cacheUntil: number;
    };
    expect(Object.keys(body).sort()).toEqual(
      ["cacheUntil", "expiresAt", "firstName", "memberId", "owner", "serverNow", "token"].sort(),
    );
    expect(body.memberId).toBe(formatMemberId(ana.memberId));
    expect(body.firstName).toBe("Ana");
    expect(JSON.stringify(body)).not.toContain("Pereira");
    expect(body.serverNow).toBeGreaterThanOrEqual(before);
    expect(body.serverNow).toBeLessThanOrEqual(after);
    // The token carries whole seconds.
    expect(body.expiresAt).toBe(Math.floor(body.serverNow / 1000) * 1000 + MEMBER_QR_LIFETIME_MS);
    expect(body.cacheUntil).toBe(body.serverNow + CARD_CACHE_MS);
    expect(body.owner).toBe(cardOwnerTag(ana.userId));
    // The token names this customer's card and nobody else's.
    expect(verifyMemberQr(body.token, body.serverNow, memberQrKeys())).toEqual({
      ok: true,
      memberId: ana.memberId,
      expiresAt: body.expiresAt,
    });
  });

  it("[P1-14] each account gets its own owner tag, so a cached card never shows under another sign-in", async () => {
    const [a, b] = await Promise.all([customer("Ben Okafor"), customer("Cy Lane")]);
    const ip = freshIp();
    const [ra, rb] = await Promise.all([get(a.principal, ip), get(b.principal, ip)]);
    const [ba, bb] = (await Promise.all([ra.json(), rb.json()])) as { owner: string }[];
    expect(ba?.owner).toMatch(/^[\w-]{22}$/);
    expect(ba?.owner).not.toBe(bb?.owner);
    expect(cardOwnerTag(a.userId)).toBe(cardOwnerTag(a.userId));
  });

  it("[P1-14] a stored name with no word in it gives an empty first name, not an error", async () => {
    const blank = await customer("   ");
    const res = await get(blank.principal, freshIp());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { firstName: string }).firstName).toBe("");
  });

  it("[P1-14] the per-IP limit answers 429 with Retry-After before any sign-in check; another address still works", async () => {
    const dee = await customer("Dee Hart");
    const ip = freshIp();
    const spec = ipLimit("member-qr", ip, MEMBER_QR_LIMITS.ip);
    if (!spec) throw new Error("a real address should be limited");
    await spend(spec);
    const limited = await get(dee.principal, ip);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await get(dee.principal, freshIp())).status).toBe(200);
  });

  it("[P1-14] the per-user limit answers 429 with Retry-After from any address", async () => {
    const eve = await customer("Eve Stone");
    await spend({ key: userKey("member-qr", eve.userId), ...MEMBER_QR_LIMITS.user });
    const limited = await get(eve.principal, freshIp());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another customer is unaffected.
    const fay = await customer("Fay Moss");
    expect((await get(fay.principal, freshIp())).status).toBe(200);
  });

  it("[P1-14] an app error becomes its JSON answer (with Retry-After when it has one); anything else is rethrown", async () => {
    const gus = await customer("Gus Reed");
    fault.error = new AppError("RATE_LIMITED", undefined, undefined, { retryAfterSec: 42 });
    const limited = await get(gus.principal, freshIp());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
    expect(limited.headers.get("cache-control")).toBe("private, no-store");
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");

    fault.error = new Error("database fell over");
    await expect(get(gus.principal, freshIp())).rejects.toThrow("database fell over");
  });
});
