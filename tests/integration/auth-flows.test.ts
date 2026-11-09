import { and, eq } from "drizzle-orm";
import { URI } from "otpauth";
import { describe, expect, it } from "vitest";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { auditLogs, sessions, users } from "@/server/db/schema";
import {
  TEST_PASSWORD,
  cookieHeaderFrom,
  createPasswordUser,
  testEmail,
  totpFromUri,
} from "../fixtures/auth";
import { firstLink, latestEmailTo } from "../support/mailpit";
import type { TOTP } from "otpauth";

const sessionRow = async (token: string) =>
  (await db().select().from(sessions).where(eq(sessions.token, token)))[0];

const signIn = (email: string, password = TEST_PASSWORD) =>
  auth.api.signInEmail({ body: { email, password }, asResponse: true });

describe("[P0-06] staff password + TOTP", () => {
  it("password-only session is not MFA verified; after enrolment sign-in requires TOTP and marks the session", async () => {
    const user = await createPasswordUser();

    // 1. Password sign-in before 2FA enrolment → session exists but mfaVerified = false.
    const first = await signIn(user.email);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { token: string };
    expect((await sessionRow(firstBody.token))?.mfaVerified).toBe(false);
    const firstHeaders = cookieHeaderFrom(first);

    // 2. Enrol TOTP.
    const enabled = await auth.api.enableTwoFactor({
      body: { password: TEST_PASSWORD },
      headers: firstHeaders,
    });
    if (enabled.method !== "totp") throw new Error("expected TOTP enrolment");
    await auth.api.verifyTOTP({
      body: { code: totpFromUri(enabled.totpURI) },
      headers: firstHeaders,
    });
    const [after] = await db().select().from(users).where(eq(users.id, user.id));
    expect(after?.twoFactorEnabled).toBe(true);
    expect(enabled.backupCodes.length).toBeGreaterThanOrEqual(10);

    // 3. Password sign-in now stops at the second factor (no session token yet).
    const second = await signIn(user.email);
    const secondBody = (await second.json()) as { twoFactorRedirect?: boolean; token?: string };
    expect(secondBody.twoFactorRedirect).toBe(true);
    expect(secondBody.token).toBeUndefined();

    // 4. TOTP verification creates an MFA-verified session.
    const verified = await auth.api.verifyTOTP({
      body: { code: totpFromUri(enabled.totpURI) },
      headers: cookieHeaderFrom(second),
      asResponse: true,
    });
    expect(verified.status).toBe(200);
    const verifiedBody = (await verified.json()) as { token: string };
    expect((await sessionRow(verifiedBody.token))?.mfaVerified).toBe(true);

    // SECURITY §12: staff/admin sign-ins are audit-logged (only the MFA-verified session counts).
    const signIns = await db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.actorId, user.id), eq(auditLogs.action, "auth.sign_in")));
    expect(signIns).toHaveLength(1);
    expect(signIns[0]).toMatchObject({ actorRole: "staff", entity: "session" });
  });

  it("rejects a wrong password with the same generic error as an unknown email (no enumeration)", async () => {
    const user = await createPasswordUser();
    const wrong = await signIn(user.email, "definitely-not-the-password");
    const unknown = await signIn(testEmail("nobody"), "definitely-not-the-password");
    expect(wrong.status).toBe(unknown.status);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("does not allow public email sign-up", async () => {
    const res = await auth.api.signUpEmail({
      body: { email: testEmail("signup"), password: TEST_PASSWORD, name: "X" },
      asResponse: true,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("[P0-06] customer magic link", () => {
  it("emails a single-use link that signs the customer in (not MFA)", async () => {
    const email = testEmail("customer");
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/wallet" },
      headers: new Headers({ origin: "http://localhost:3000" }),
    });
    // Real SMTP delivery, read back from Mailpit.
    const message = await latestEmailTo(email);
    expect(message.subject).toBe("Your Moz Rewards sign-in link");
    const link = firstLink(message.text);
    expect(link).toBeDefined();

    const res = await auth.handler(
      new Request(link!, { headers: { origin: "http://localhost:3000" } }),
    );
    expect(res.status).toBe(302);
    const token = res.headers
      .getSetCookie()
      .find((c) => c.includes("session_token="))
      ?.split(";")[0]
      ?.split("=")[1];
    expect(token).toBeDefined();
    const signedToken = decodeURIComponent(token!).split(".")[0]!;
    expect((await sessionRow(signedToken))?.mfaVerified).toBe(false);

    // Re-using the same link must not create another session.
    const reuse = await auth.handler(
      new Request(link!, { headers: { origin: "http://localhost:3000" } }),
    );
    expect(reuse.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
  });
});

describe("[P0-06] second-factor edge cases", () => {
  async function enrolledStaff(): Promise<{ email: string; uri: string; backupCodes: string[] }> {
    const user = await createPasswordUser();
    const headers = cookieHeaderFrom(await signIn(user.email));
    const enabled = await auth.api.enableTwoFactor({ body: { password: TEST_PASSWORD }, headers });
    if (enabled.method !== "totp") throw new Error("expected TOTP enrolment");
    await auth.api.verifyTOTP({ body: { code: totpFromUri(enabled.totpURI) }, headers });
    return { email: user.email, uri: enabled.totpURI, backupCodes: enabled.backupCodes };
  }

  /** A fresh sign-in challenge (password accepted, two-factor cookie set), then one code attempt. */
  async function challenge(
    email: string,
    verify: (headers: Headers) => Promise<Response>,
  ): Promise<number> {
    const headers = cookieHeaderFrom(await signIn(email));
    return (await verify(headers)).status;
  }

  it("accepts a TOTP code one step (30 s) early or late for clock drift, rejects two steps", async () => {
    const { email, uri } = await enrolledStaff();
    const totp = URI.parse(uri) as TOTP;
    const at = (offsetSec: number) => (headers: Headers) =>
      auth.api.verifyTOTP({
        body: { code: totp.generate({ timestamp: Date.now() + offsetSec * 1000 }) },
        headers,
        asResponse: true,
      });
    expect(await challenge(email, at(-30))).toBe(200);
    expect(await challenge(email, at(30))).toBe(200);
    expect(await challenge(email, at(-65))).not.toBe(200);
    expect(await challenge(email, at(65))).not.toBe(200);
  });

  it("a recovery code signs in once; reusing it is refused", async () => {
    const { email, backupCodes } = await enrolledStaff();
    expect(backupCodes).toHaveLength(10);
    const code = backupCodes[0] ?? "";
    const useCode = (headers: Headers) =>
      auth.api.verifyBackupCode({ body: { code }, headers, asResponse: true });
    expect(await challenge(email, useCode)).toBe(200);
    expect(await challenge(email, useCode)).not.toBe(200);
  });
});

describe("[P0-07] client IP comes from TRUSTED_PROXY, not client headers (security review #6)", () => {
  it("with no trusted proxy, a spoofed X-Forwarded-For is not recorded on the session", async () => {
    const user = await createPasswordUser();
    const res = await auth.api.signInEmail({
      body: { email: user.email, password: TEST_PASSWORD },
      headers: new Headers({ "x-forwarded-for": "6.6.6.6" }),
      asResponse: true,
    });
    const { token } = (await res.json()) as { token: string };
    expect((await sessionRow(token))?.ipAddress || null).toBeNull(); // stored as "" when unknown
  });
});
