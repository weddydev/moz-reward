import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import {
  checkStaffLogin,
  clearStaffLoginFailures,
  recordStaffLoginFailure,
  STAFF_LOGIN,
} from "@/server/auth/staff-login";
import { TEST_PASSWORD, testEmail } from "../fixtures/auth";
import { makeShop, makeStaff, makeUser } from "../fixtures/factories";
import { countEmailsTo, latestEmailTo } from "../support/mailpit";

const ORIGIN = "http://localhost:3000";
/** Unique per call (IPv6 documentation range): limiter state outlives a test run, so shared IPs would collide. */
const ip = (): string => `2001:db8::${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}`;
const T0 = Date.UTC(2026, 10, 9, 9, 0, 0);

async function staff(label: string): Promise<{ email: string }> {
  const user = await makeUser({ email: testEmail(label) });
  await makeStaff((await makeShop()).id, user.id, "staff");
  return { email: user.email };
}

const signInHttp = (email: string, password: string): Promise<Response> =>
  getAuth().handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );

describe("[P0-06] staff/admin login throttling (SECURITY §6)", () => {
  it("allows 10 attempts per 15 minutes per IP, then 429", async () => {
    const from = ip();
    for (let i = 0; i < STAFF_LOGIN.perIp.max; i++) {
      expect(await checkStaffLogin({ email: testEmail(`ip${String(i)}`), ip: from })).toEqual({
        ok: true,
      });
    }
    expect(await checkStaffLogin({ email: testEmail("ip-over"), ip: from })).toMatchObject({
      ok: false,
      status: 429,
    });
  });

  it("locks an account after 5 failures from any IP, backs off (1 min, then doubling), and a success clears it", async () => {
    const email = testEmail("backoff");
    for (let i = 0; i < STAFF_LOGIN.lockAfter - 1; i++)
      await recordStaffLoginFailure({ email, now: T0 });
    expect(await checkStaffLogin({ email, ip: ip(), now: T0 })).toEqual({ ok: true });

    await recordStaffLoginFailure({ email, now: T0 }); // 5th failure
    expect(
      await checkStaffLogin({ email: email.toUpperCase(), ip: ip(), now: T0 + 30_000 }),
    ).toMatchObject({
      ok: false,
      status: 429,
    });
    expect((await checkStaffLogin({ email, ip: ip(), now: T0 + 61_000 })).ok).toBe(true);

    await recordStaffLoginFailure({ email, now: T0 + 61_000 }); // 6th: 2 minutes
    expect((await checkStaffLogin({ email, ip: ip(), now: T0 + 61_000 + 90_000 })).ok).toBe(false);
    expect((await checkStaffLogin({ email, ip: ip(), now: T0 + 61_000 + 121_000 })).ok).toBe(true);

    await clearStaffLoginFailures(email);
    await recordStaffLoginFailure({ email, now: T0 + 200_000 });
    expect((await checkStaffLogin({ email, ip: ip(), now: T0 + 200_000 })).ok).toBe(true);
  });

  it("the lock never exceeds 15 minutes", async () => {
    const email = testEmail("cap");
    for (let i = 0; i < 20; i++) await recordStaffLoginFailure({ email, now: T0 });
    expect((await checkStaffLogin({ email, ip: ip(), now: T0 + 15 * 60_000 - 1000 })).ok).toBe(
      false,
    );
    expect((await checkStaffLogin({ email, ip: ip(), now: T0 + 15 * 60_000 + 1000 })).ok).toBe(
      true,
    );
  });

  it("emails the account owner once when the lock starts; unknown emails get nothing", async () => {
    const { email } = await staff("lockmail");
    const unknown = testEmail("lockmail-unknown");
    for (let i = 0; i < STAFF_LOGIN.lockAfter + 2; i++) {
      await recordStaffLoginFailure({ email, now: T0 });
      await recordStaffLoginFailure({ email: unknown, now: T0 });
    }
    const message = await latestEmailTo(email);
    expect(message.subject).toBe("Sign-in to your Moz Rewards staff account was paused");
    expect(message.text).not.toMatch(/password[: ]+\S{8,}/i);
    expect(await countEmailsTo(email)).toBe(1);
    expect(await countEmailsTo(unknown)).toBe(0);
  });

  it("over HTTP: wrong passwords lock the account; even the right password then gets 429", async () => {
    const { email } = await staff("http-lock");
    for (let i = 0; i < STAFF_LOGIN.lockAfter; i++) {
      expect((await signInHttp(email, "wrong-password-123")).status).toBe(401);
    }
    const locked = await signInHttp(email, TEST_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
  });

  it("over HTTP: a successful sign-in clears earlier failures", async () => {
    const { email } = await staff("http-clear");
    for (let i = 0; i < STAFF_LOGIN.lockAfter - 1; i++)
      await signInHttp(email, "wrong-password-123");
    expect((await signInHttp(email, TEST_PASSWORD)).status).toBe(200);
    for (let i = 0; i < STAFF_LOGIN.lockAfter - 1; i++)
      await signInHttp(email, "wrong-password-123");
    expect((await signInHttp(email, TEST_PASSWORD)).status).toBe(200);
  });
});
