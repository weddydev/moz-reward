import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TURNSTILE_BYPASS_TOKEN, TURNSTILE_REQUIRED_CODE } from "@/lib/turnstile";
import type * as AttemptGuardModule from "@/server/auth/attempt-guard";
import { getAuth } from "@/server/auth/auth";
import { beginSecondFactor, beginStaffLogin, STAFF_LOGIN } from "@/server/auth/staff-login";
import { testOwnerDb as db } from "@/server/db/client";
import { auditLogs, outbox } from "@/server/db/schema";
import { closeQueues } from "@/server/jobs/queues";
import { startRelay } from "@/server/jobs/relay";
import { startWorkers } from "@/server/jobs/worker";
import { securityAlert } from "@/server/security/alert";
import { ipKey, limiterKey, limiterRedis } from "@/server/security/rate-limit";
import type * as RequestModule from "@/server/security/request";
import type * as TurnstileModule from "@/server/security/turnstile";
import { cookieHeaderFrom, TEST_PASSWORD, testEmail, totpFromUri } from "../fixtures/auth";
import { makeShop, makeStaff, makeUser } from "../fixtures/factories";
import { countEmailsTo, latestEmailTo } from "../support/mailpit";

/**
 * Integration runs with TRUSTED_PROXY=none (every request is "local"). Here the client IP is read the way it
 * is behind Caddy, so each request can come from its own address (X-Forwarded-For, right-most hop).
 */
vi.mock("@/server/security/request", async (importOriginal) => {
  const actual = await importOriginal<typeof RequestModule>();
  return { ...actual, clientIp: (headers: Headers) => actual.clientIp(headers, "caddy") };
});
const faults = vi.hoisted(() => ({ turnstileDown: false, redisDown: null as Redis | null }));
vi.mock("@/server/security/turnstile", async (importOriginal) => {
  const actual = await importOriginal<typeof TurnstileModule>();
  return {
    ...actual,
    verifyTurnstile: (token: string | null | undefined, ip: string) =>
      faults.turnstileDown
        ? Promise.resolve({ ok: false, reason: "unavailable" })
        : actual.verifyTurnstile(token, ip),
  };
});
vi.mock("@/server/auth/attempt-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof AttemptGuardModule>();
  return {
    ...actual,
    reserveAttempt: (opts: Parameters<typeof actual.reserveAttempt>[0]) =>
      actual.reserveAttempt(faults.redisDown ? { ...opts, redis: faults.redisDown } : opts),
  };
});
vi.mock("@/server/security/alert", () => ({ securityAlert: vi.fn(), opsAlert: vi.fn() }));

const ORIGIN = "http://localhost:3000";
/** Unique per call (IPv6 documentation range, random /64: limits key IPv6 by its /64): limiter state outlives a test run, so shared IPs would collide. */
const ip = (): string => `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`;
const T0 = Date.UTC(2026, 10, 10, 9, 0, 0);
const WRONG = "wrong-password-123";
const { lockAfter } = STAFF_LOGIN.password;

// Lockout emails are outbox rows (P0-18): the relay and the real email worker deliver them to Mailpit.
let delivery: { stop: () => Promise<void> } | undefined;
beforeAll(() => {
  const relay = startRelay({ intervalMs: 50 });
  const workers = startWorkers(["email"]);
  delivery = {
    stop: async () => {
      await relay.stop();
      await workers.close();
      await closeQueues();
    },
  };
});
afterAll(async () => {
  await delivery?.stop();
});

afterEach(() => {
  faults.turnstileDown = false;
  faults.redisDown = null;
  vi.mocked(securityAlert).mockClear();
});
const down = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
afterAll(() => {
  down.disconnect();
});

async function staff(label: string): Promise<{ id: string; email: string }> {
  const user = await makeUser({ email: testEmail(label) });
  await makeStaff((await makeShop()).id, user.id, "staff");
  return { id: user.id, email: user.email };
}

const post = (path: string, body: unknown, headers: Record<string, string>): Promise<Response> =>
  getAuth().handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

const signInHttp = (
  email: string,
  password: string,
  opts: { from?: string; turnstile?: string } = {},
): Promise<Response> =>
  post(
    "/sign-in/email",
    { email, password },
    {
      "x-forwarded-for": opts.from ?? ip(),
      ...(opts.turnstile ? { "x-turnstile-token": opts.turnstile } : {}),
    },
  );

const hasSession = (res: Response): boolean =>
  res.headers.getSetCookie().some((c) => c.includes("session_token="));
const errorCode = async (res: Response): Promise<unknown> =>
  ((await res.json()) as { code?: unknown }).code;

describe("[P0-06][P0-19] staff/admin password sign-in throttling (SECURITY §2, §6)", () => {
  it("allows 10 attempts per 15 minutes per IP, then 429", async () => {
    const from = ip();
    for (let i = 0; i < STAFF_LOGIN.perIp.max; i++) {
      const r = await beginStaffLogin({ email: testEmail(`ip${String(i)}`), ip: from });
      expect(r.ok).toBe(true);
    }
    expect(await beginStaffLogin({ email: testEmail("ip-over"), ip: from })).toMatchObject({
      ok: false,
      status: 429,
    });
  });

  it("an unknown client IP shares one strict bucket for password and second-factor attempts", async () => {
    await limiterRedis().del(limiterKey(ipKey("staff-login", "unknown")));
    await limiterRedis().del(limiterKey(ipKey("staff-2fa", "unknown")));
    const strict = Math.floor(STAFF_LOGIN.perIp.max / 4);
    for (let i = 0; i < strict; i++) {
      expect(
        (await beginStaffLogin({ email: testEmail(`unk${String(i)}`), ip: "unknown" })).ok,
      ).toBe(true);
    }
    expect(await beginStaffLogin({ email: testEmail("unk-over"), ip: "unknown" })).toMatchObject({
      ok: false,
      status: 429,
    });
    const strict2fa = Math.max(1, Math.floor(STAFF_LOGIN.secondFactorPerIp.max / 4));
    for (let i = 0; i < strict2fa; i++) {
      expect((await beginSecondFactor({ ip: "unknown", userId: null })).ok).toBe(true);
    }
    expect((await beginSecondFactor({ ip: "unknown", userId: null })).ok).toBe(false);
  });

  it("AC4: one wrong attempt every 15 minutes from rotating IPs can't keep the owner out; they pass with Turnstile", async () => {
    const email = testEmail("hold-open");
    for (let i = 0; i < lockAfter; i++) {
      expect((await beginStaffLogin({ email, ip: ip(), now: T0 })).ok).toBe(true);
    }
    // The attacker keeps poking for 4 hours without solving the check: refused, and never counted.
    for (let t = 1; t <= 16; t++) {
      expect(await beginStaffLogin({ email, ip: ip(), now: T0 + t * 15 * 60_000 })).toMatchObject({
        ok: false,
        code: TURNSTILE_REQUIRED_CODE,
      });
    }
    // The owner, from their own IP, with the check: let through to the password at any moment.
    expect(
      (
        await beginStaffLogin({
          email,
          ip: ip(),
          turnstileToken: TURNSTILE_BYPASS_TOKEN,
          now: T0 + 16 * 15 * 60_000 + 1,
        })
      ).ok,
    ).toBe(true);
  });

  it("AC4 over HTTP: past the limit a correct password needs the check; with it, sign-in succeeds", async () => {
    const { email } = await staff("http-challenge");
    for (let i = 0; i < lockAfter; i++) expect((await signInHttp(email, WRONG)).status).toBe(401);

    const noCheck = await signInHttp(email, TEST_PASSWORD);
    expect(noCheck.status).toBe(400);
    expect(await errorCode(noCheck)).toBe(TURNSTILE_REQUIRED_CODE);
    expect(hasSession(noCheck)).toBe(false);

    const badCheck = await signInHttp(email, TEST_PASSWORD, { turnstile: "forged-token" });
    expect(badCheck.status).toBe(400);
    expect(await errorCode(badCheck)).toBe(TURNSTILE_REQUIRED_CODE);
    expect(hasSession(badCheck)).toBe(false);

    const ok = await signInHttp(email, TEST_PASSWORD, { turnstile: TURNSTILE_BYPASS_TOKEN });
    expect(ok.status).toBe(200);
    expect(hasSession(ok)).toBe(true);
    // The success cleared the account counter: the next sign-in needs no check.
    expect((await signInHttp(email, TEST_PASSWORD)).status).toBe(200);
  });

  it("AC5 over HTTP: parallel wrong passwords from many IPs never get past the threshold", async () => {
    const { email } = await staff("http-parallel");
    const results = await Promise.all(Array.from({ length: 15 }, () => signInHttp(email, WRONG)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(lockAfter);
    expect(statuses.filter((s) => s === 400)).toHaveLength(15 - lockAfter);
    // One lockout, one alert, despite the burst.
    expect(
      vi.mocked(securityAlert).mock.calls.filter(([, d]) => d.scope === "account"),
    ).toHaveLength(1);
  });

  it("repeated failures from one source lock that account + IP, even with the check; other IPs still get in", async () => {
    const { email } = await staff("http-source");
    const attacker = ip();
    for (let i = 0; i < lockAfter; i++) {
      expect((await signInHttp(email, WRONG, { from: attacker })).status).toBe(401);
    }
    const locked = await signInHttp(email, TEST_PASSWORD, {
      from: attacker,
      turnstile: TURNSTILE_BYPASS_TOKEN,
    });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(hasSession(locked)).toBe(false);
    const owner = await signInHttp(email, TEST_PASSWORD, { turnstile: TURNSTILE_BYPASS_TOKEN });
    expect(owner.status).toBe(200);
  });

  it("a successful sign-in clears earlier failures (the reservation is settled by the same request)", async () => {
    const { email } = await staff("http-clear");
    for (let i = 0; i < lockAfter - 1; i++) await signInHttp(email, WRONG);
    expect((await signInHttp(email, TEST_PASSWORD)).status).toBe(200);
    for (let i = 0; i < lockAfter - 1; i++) await signInHttp(email, WRONG);
    expect((await signInHttp(email, TEST_PASSWORD)).status).toBe(200);
  });

  it("a lockout raises one alert, writes an audit row and emails the owner once; unknown emails get no mail", async () => {
    const { id, email } = await staff("lockmail");
    const unknown = testEmail("lockmail-unknown");
    for (let i = 0; i < lockAfter + 2; i++) {
      await signInHttp(email, WRONG, { turnstile: TURNSTILE_BYPASS_TOKEN });
      await signInHttp(unknown, WRONG, { turnstile: TURNSTILE_BYPASS_TOKEN });
    }
    const message = await latestEmailTo(email);
    expect(message.subject).toBe(
      "Several wrong passwords were tried on your Moz Rewards staff account",
    );
    expect(message.text).not.toMatch(/password[: ]+\S{8,}/i);
    await expect
      .poll(async () =>
        db()
          .select({ meta: auditLogs.meta, ipHash: auditLogs.ipHash })
          .from(auditLogs)
          .where(and(eq(auditLogs.action, "auth.lockout"), eq(auditLogs.entityId, id))),
      )
      .toEqual([
        {
          meta: { reason: "password", scope: "account", role: "staff" },
          ipHash: expect.any(String) as unknown,
        },
      ]);
    expect(await countEmailsTo(email)).toBe(1);
    expect(await countEmailsTo(unknown)).toBe(0);
    const jobs = () =>
      db()
        .select({ payload: outbox.payload, done: sql<boolean>`${outbox.completedAt} IS NOT NULL` })
        .from(outbox)
        .where(sql`${outbox.payload} -> 'data' ->> 'userId' = ${id}`);
    // One job, ids only (no address), marked complete by the worker.
    await expect
      .poll(jobs)
      .toEqual([{ payload: { v: 1, data: { userId: id, reason: "password" } }, done: true }]);
    const alerts = vi.mocked(securityAlert).mock.calls.filter(([, d]) => d.scope === "account");
    expect(alerts).toHaveLength(2); // one per account, the unknown address included
    expect(JSON.stringify(alerts)).not.toContain(email);
  });

  it("Redis down: sign-in fails closed with a friendly 503 and Retry-After", async () => {
    const { email } = await staff("redis-down");
    faults.redisDown = down;
    const res = await signInHttp(email, TEST_PASSWORD);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(hasSession(res)).toBe(false);
    expect(((await res.json()) as { message: string }).message).toMatch(/briefly unavailable/);
  });

  it("Turnstile outage: a locked account's sign-in is refused (503), never let through unchecked", async () => {
    const { email } = await staff("turnstile-down");
    for (let i = 0; i < lockAfter; i++) await signInHttp(email, WRONG);
    faults.turnstileDown = true;
    const res = await signInHttp(email, TEST_PASSWORD, { turnstile: "any-token" });
    expect(res.status).toBe(503);
    expect(hasSession(res)).toBe(false);
  });
});

describe("[P0-19] second-factor failures are counted per user (B-CR-5, SECURITY §6)", () => {
  /** A staff member with TOTP on (set up through the server API, which bypasses the HTTP guards). */
  async function enrolledStaff(label: string): Promise<{ id: string; email: string; uri: string }> {
    const user = await staff(label);
    const signedIn = await getAuth().api.signInEmail({
      body: { email: user.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    const headers = cookieHeaderFrom(signedIn);
    const enabled = await getAuth().api.enableTwoFactor({
      body: { password: TEST_PASSWORD },
      headers,
    });
    if (enabled.method !== "totp") throw new Error("expected TOTP enrolment");
    await getAuth().api.verifyTOTP({ body: { code: totpFromUri(enabled.totpURI) }, headers });
    return { ...user, uri: enabled.totpURI };
  }

  /** Password step over HTTP from `from`, then one TOTP attempt with `code` from the same IP. */
  async function codeAttempt(email: string, code: string, from = ip()): Promise<Response> {
    const challenge = await signInHttp(email, TEST_PASSWORD, { from });
    expect(
      ((await challenge.clone().json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect,
    ).toBe(true);
    const cookie = cookieHeaderFrom(challenge).get("cookie") ?? "";
    return post("/two-factor/verify-totp", { code }, { cookie, "x-forwarded-for": from });
  }

  it("5 wrong codes from different IPs lock code entry for that user; even the right code then gets 429", async () => {
    const { id, email, uri } = await enrolledStaff("2fa-lock");
    for (let i = 0; i < STAFF_LOGIN.secondFactor.lockAfter; i++) {
      expect((await codeAttempt(email, "000000")).status).toBe(401);
    }
    const locked = await codeAttempt(email, totpFromUri(uri));
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(hasSession(locked)).toBe(false);
    expect(vi.mocked(securityAlert)).toHaveBeenCalledWith(
      "auth.lockout",
      expect.objectContaining({ reason: "second-factor", account: id }),
    );
    expect((await latestEmailTo(email)).subject).toBe(
      "Several wrong codes were tried on your Moz Rewards staff account",
    );
  });

  it("the right code clears earlier code failures", async () => {
    const { email, uri } = await enrolledStaff("2fa-clear");
    for (let i = 0; i < STAFF_LOGIN.secondFactor.lockAfter - 1; i++) {
      expect((await codeAttempt(email, "000000")).status).toBe(401);
    }
    const ok = await codeAttempt(email, totpFromUri(uri));
    expect(ok.status).toBe(200);
    expect(hasSession(ok)).toBe(true);
    for (let i = 0; i < STAFF_LOGIN.secondFactor.lockAfter - 1; i++) {
      expect((await codeAttempt(email, "000000")).status).toBe(401);
    }
    // TOTP codes are single-use per step, so this proves only that the user isn't locked (401, not 429).
    expect((await codeAttempt(email, "000000")).status).toBe(401);
  });

  it("backs off per user: 1 minute after the 5th failure, doubling", async () => {
    const userId = `user-${randomUUID()}`;
    for (let i = 0; i < STAFF_LOGIN.secondFactor.lockAfter; i++) {
      expect((await beginSecondFactor({ ip: ip(), userId, now: T0 })).ok).toBe(true);
    }
    expect(await beginSecondFactor({ ip: ip(), userId, now: T0 + 30_000 })).toMatchObject({
      ok: false,
      status: 429,
    });
    expect((await beginSecondFactor({ ip: ip(), userId, now: T0 + 60_000 })).ok).toBe(true);
    expect((await beginSecondFactor({ ip: ip(), userId, now: T0 + 60_000 + 119_000 })).ok).toBe(
      false,
    );
  });
});

describe("[P0-19] failed staff sign-ins are audit-logged (SECURITY §2, §12)", () => {
  it("a wrong password on a real staff account writes auth.sign_in_failed; an unknown address writes nothing", async () => {
    const { id, email } = await staff("audit-fail");
    expect((await signInHttp(email, WRONG)).status).toBe(401);
    expect((await signInHttp(testEmail("audit-unknown"), WRONG)).status).toBe(401);
    await expect
      .poll(async () =>
        db()
          .select({ meta: auditLogs.meta })
          .from(auditLogs)
          .where(and(eq(auditLogs.action, "auth.sign_in_failed"), eq(auditLogs.entityId, id))),
      )
      .toEqual([{ meta: { factor: "password", role: "staff" } }]);
    const rows = await db()
      .select({ meta: auditLogs.meta })
      .from(auditLogs)
      .where(eq(auditLogs.action, "auth.sign_in_failed"));
    expect(JSON.stringify(rows)).not.toContain("audit-unknown");
  });
});
