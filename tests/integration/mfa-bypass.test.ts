import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auth } from "@/server/auth/auth";
import { isPrivilegedEmail } from "@/server/auth/privileged";
import { db } from "@/server/db/client";
import { sessions, twoFactors, users } from "@/server/db/schema";
import {
  TEST_PASSWORD,
  cookieHeaderFrom,
  createPasswordUser,
  testEmail,
  totpFromUri,
} from "../fixtures/auth";
import { makeAdmin, makeShop, makeStaff, makeUser } from "../fixtures/factories";
import { countEmailsTo, firstLink, latestEmailTo } from "../support/mailpit";

/**
 * Audit security #1 (critical): a staff/admin could sign in by email link or Google, register a passkey on
 * that non-MFA session, then sign in with the passkey and get an MFA-verified session (skipping password + TOTP).
 * #6: passkeys counted as MFA without user verification.
 */
const ORIGIN = { origin: "http://localhost:3000" };
const sendLink = (email: string) =>
  auth.api.signInMagicLink({
    body: { email, callbackURL: "/wallet" },
    headers: new Headers(ORIGIN),
    asResponse: true,
  });
const sessionsOf = async (userId: string) =>
  db().select().from(sessions).where(eq(sessions.userId, userId));
const registerOptions = (headers: Headers) =>
  auth.handler(
    new Request("http://localhost:3000/api/auth/passkey/generate-register-options", { headers }),
  );

async function staffUser() {
  const user = await createPasswordUser();
  const shop = await makeShop();
  await makeStaff(shop.id, user.id, "owner");
  return user;
}

describe("[P0-06] staff/admin MFA bypass is closed (audit security #1, #6)", () => {
  it("never emails a sign-in link to staff or admins, and answers exactly as for customers", async () => {
    const staff = await staffUser();
    const admin = await makeUser({ email: testEmail("admin") });
    await makeAdmin(admin.id, "owner");
    const customer = testEmail("customer");

    const staffRes = await sendLink(staff.email);
    const adminRes = await sendLink(admin.email);
    const customerRes = await sendLink(customer);
    expect([staffRes.status, adminRes.status]).toEqual([customerRes.status, customerRes.status]);
    expect(await staffRes.json()).toEqual(await customerRes.json());

    // SMTP is delivered in order: once the customer's email is in Mailpit, the earlier ones would be too.
    await latestEmailTo(customer);
    expect(await countEmailsTo(staff.email)).toBe(0);
    expect(await countEmailsTo(admin.email)).toBe(0);
  });

  it("treats a staff row stored with a mixed-case email as privileged (no email link)", async () => {
    // Raw inserts (seeds, invites) may keep the case; the check must not fail open.
    const lower = testEmail("mixedcase");
    const [user] = await db()
      .insert(users)
      .values({
        email: lower.replace(/^./, (c) => c.toUpperCase()).replace("@", "@Shop."),
        name: "Owner",
      })
      .returning();
    const stored = user?.email ?? "";
    expect(stored).not.toBe(stored.toLowerCase());
    const shop = await makeShop();
    await makeStaff(shop.id, user?.id ?? "", "owner");

    expect(await isPrivilegedEmail(stored.toLowerCase())).toBe(true);
    expect(await isPrivilegedEmail(`  ${stored.toUpperCase()} `)).toBe(true);
    await sendLink(stored.toLowerCase());
    const customer = testEmail("customer-after-mixed");
    await sendLink(customer);
    await latestEmailTo(customer);
    expect(await countEmailsTo(stored.toLowerCase())).toBe(0);
  });

  it("refuses a sign-in link issued before the account became staff", async () => {
    const user = await makeUser({ email: testEmail("promoted"), password: null });
    await sendLink(user.email);
    const link = firstLink((await latestEmailTo(user.email)).text);
    expect(link).toBeDefined();

    const shop = await makeShop();
    await makeStaff(shop.id, user.id, "staff");
    const res = await auth.handler(new Request(link!, { headers: ORIGIN }));
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
    expect(await sessionsOf(user.id)).toEqual([]);
  });

  it("refuses passkey registration on a session that is not MFA-verified (password-only staff)", async () => {
    const staff = await staffUser();
    const signedIn = await auth.api.signInEmail({
      body: { email: staff.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    expect(signedIn.status).toBe(200);
    const res = await registerOptions(cookieHeaderFrom(signedIn));
    expect(res.status).toBe(403);
  });

  it("refuses passkey registration for customers signed in by email link", async () => {
    const email = testEmail("customer-passkey");
    await sendLink(email);
    const link = firstLink((await latestEmailTo(email)).text);
    const signedIn = await auth.handler(new Request(link!, { headers: ORIGIN }));
    const res = await registerOptions(cookieHeaderFrom(signedIn));
    expect(res.status).toBe(403);
  });

  it("refuses to turn off two-step verification for staff, leaving it fully on (security review row 3)", async () => {
    const staff = await staffUser();
    const signedIn = await auth.api.signInEmail({
      body: { email: staff.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    const headers = cookieHeaderFrom(signedIn);
    const enabled = await auth.api.enableTwoFactor({ body: { password: TEST_PASSWORD }, headers });
    if (enabled.method !== "totp") throw new Error("expected TOTP enrolment");
    // Enrolment verification issues a fresh (MFA) session cookie; use it.
    const verified = await auth.api.verifyTOTP({
      body: { code: totpFromUri(enabled.totpURI) },
      headers,
      asResponse: true,
    });
    const mfaHeaders = cookieHeaderFrom(verified);

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/two-factor/disable", {
        method: "POST",
        headers: { ...Object.fromEntries(mfaHeaders), "content-type": "application/json" },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      }),
    );
    expect(res.status).toBe(403);
    const [row] = await db().select().from(users).where(eq(users.id, staff.id));
    expect(row?.twoFactorEnabled).toBe(true);
    expect(
      await db().select().from(twoFactors).where(eq(twoFactors.userId, staff.id)),
    ).toHaveLength(1);
  });

  it("lets staff change their password; the new session must pass MFA again (security review row 3)", async () => {
    const staff = await staffUser();
    const signedIn = await auth.api.signInEmail({
      body: { email: staff.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    const res = await auth.api.changePassword({
      body: {
        currentPassword: TEST_PASSWORD,
        newPassword: "a-brand-new-password-2026",
        revokeOtherSessions: true,
      },
      headers: cookieHeaderFrom(signedIn),
      asResponse: true,
    });
    expect(res.status).toBe(200);
    const rows = await sessionsOf(staff.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mfaVerified).toBe(false);
    const again = await auth.api.signInEmail({
      body: { email: staff.email, password: "a-brand-new-password-2026" },
      asResponse: true,
    });
    expect(again.status).toBe(200);
  });

  it("allows passkey registration on an MFA-verified session and requires user verification", async () => {
    const staff = await staffUser();
    const signedIn = await auth.api.signInEmail({
      body: { email: staff.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    // Same state a TOTP verification produces (proved in auth-flows.test.ts).
    await db().update(sessions).set({ mfaVerified: true }).where(eq(sessions.userId, staff.id));
    const res = await registerOptions(cookieHeaderFrom(signedIn));
    expect(res.status).toBe(200);
    const options = (await res.json()) as {
      authenticatorSelection?: { userVerification?: string };
    };
    expect(options.authenticatorSelection?.userVerification).toBe("required");
  });
});

describe("[P0-06] first enrolment can't stand in for the second factor (audit security #5)", () => {
  it("verifying the code while enrolling leaves no MFA-verified session; only the sign-in challenge creates one", async () => {
    const user = await staffUser();
    const first = await auth.api.signInEmail({
      body: { email: user.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    const headers = cookieHeaderFrom(first);
    const enabled = await auth.api.enableTwoFactor({ body: { password: TEST_PASSWORD }, headers });
    if (enabled.method !== "totp") throw new Error("expected TOTP enrolment");
    // Someone holding only the password enrols and verifies a code from *their* app…
    await auth.api.verifyTOTP({ body: { code: totpFromUri(enabled.totpURI) }, headers });
    // …but no session of this account may count as MFA-verified from that.
    expect((await sessionsOf(user.id)).map((s) => s.mfaVerified)).not.toContain(true);

    // The real sign-in challenge (password, then code with the two-factor cookie) still works.
    const challenge = await auth.api.signInEmail({
      body: { email: user.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    const verified = await auth.api.verifyTOTP({
      body: { code: totpFromUri(enabled.totpURI) },
      headers: cookieHeaderFrom(challenge),
      asResponse: true,
    });
    const { token } = (await verified.json()) as { token: string };
    const rows = await sessionsOf(user.id);
    expect(rows.find((s) => s.token === token)?.mfaVerified).toBe(true);
  });
});

describe("[P0-06] breached passwords are refused when a password is set", () => {
  it("change-password to a known-breached password fails with a clear message; the old one keeps working", async () => {
    const staff = await staffUser();
    const signedIn = await auth.api.signInEmail({
      body: { email: staff.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    // Through the HTTP handler, as the browser calls it (auth.api rethrows before-hook errors).
    const headers = cookieHeaderFrom(signedIn);
    headers.set("origin", ORIGIN.origin);
    headers.set("content-type", "application/json");
    const res = await auth.handler(
      new Request(`${ORIGIN.origin}/api/auth/change-password`, {
        method: "POST",
        headers,
        body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: "password123456" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message?: string }).message).toMatch(/data breach/);
    const again = await auth.api.signInEmail({
      body: { email: staff.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    expect(again.status).toBe(200);
  });
});
