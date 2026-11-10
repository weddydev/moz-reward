import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as authRoute from "@/app/api/auth/[...all]/route";
import { TURNSTILE_BYPASS_TOKEN } from "@/lib/turnstile";
import { getAuth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import {
  confirmSignInLink,
  cookieHeaderFrom,
  TEST_PASSWORD,
  testEmail,
  totpFromUri,
} from "../fixtures/auth";
import { makeAdmin, makeShop, makeStaff, makeUser } from "../fixtures/factories";
import { firstLink, latestEmailTo } from "../support/mailpit";

const ORIGIN = "http://localhost:3000";
const CUSTOMER_MAX_AGE = 30 * 24 * 60 * 60;
const STAFF_MAX_AGE = 12 * 60 * 60;
const ADMIN_MAX_AGE = 2 * 60 * 60;

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  authRoute.POST(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

/** The last Set-Cookie for the session token (the browser applies them in order), parsed. */
function sessionCookie(res: Response): { value: string; maxAge: number | null; attrs: string[] } {
  const all = res.headers
    .getSetCookie()
    .filter((c) => /(^|\.)session_token=/.test(c.split(";")[0] ?? ""));
  const last = all.at(-1);
  if (!last) throw new Error("no session cookie set");
  const [pair = "", ...attrs] = last.split(";").map((p) => p.trim());
  const maxAge = attrs.find((a) => /^max-age=/i.test(a));
  return {
    value: pair.slice(pair.indexOf("=") + 1),
    maxAge: maxAge ? Number(maxAge.split("=")[1]) : null,
    attrs: attrs.map((a) => a.toLowerCase()),
  };
}

const near = (actual: number | null, expected: number): void => {
  expect(actual).not.toBeNull();
  expect(actual).toBeLessThanOrEqual(expected);
  expect(actual).toBeGreaterThan(expected - 60);
};

async function staffUser(label: string, role: "staff" | "admin") {
  const user = await makeUser({ email: testEmail(label) });
  if (role === "admin") await makeAdmin(user.id, "owner");
  else await makeStaff((await makeShop()).id, user.id, "staff");
  return user;
}

describe("[P0-19] session cookie lifetime per role (SECURITY §2, §5)", () => {
  it("customer: 30 days, HttpOnly, SameSite=Lax, Path=/", async () => {
    const email = testEmail("cookie-customer");
    expect(
      (
        await post(
          "/sign-in/magic-link",
          { email, callbackURL: "/wallet" },
          { "x-turnstile-token": TURNSTILE_BYPASS_TOKEN },
        )
      ).status,
    ).toBe(200);
    const click = await confirmSignInLink(firstLink((await latestEmailTo(email)).text) ?? "");
    const cookie = sessionCookie(click);
    expect(cookie.maxAge).toBe(CUSTOMER_MAX_AGE);
    expect(cookie.attrs).toEqual(expect.arrayContaining(["httponly", "samesite=lax", "path=/"]));
  });

  it("staff (password only, before enrolling 2FA): at most 12 hours", async () => {
    const user = await staffUser("cookie-staff", "staff");
    const res = await post("/sign-in/email", { email: user.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    near(sessionCookie(res).maxAge, STAFF_MAX_AGE);
  });

  it("admin after the second factor: at most 2 hours", async () => {
    const user = await staffUser("cookie-admin", "admin");
    const setup = cookieHeaderFrom(
      await getAuth().api.signInEmail({
        body: { email: user.email, password: TEST_PASSWORD },
        asResponse: true,
      }),
    );
    const enabled = await getAuth().api.enableTwoFactor({
      body: { password: TEST_PASSWORD },
      headers: setup,
    });
    if (enabled.method !== "totp") throw new Error("expected TOTP");
    await getAuth().api.verifyTOTP({
      body: { code: totpFromUri(enabled.totpURI) },
      headers: setup,
    });

    const challenge = await post("/sign-in/email", { email: user.email, password: TEST_PASSWORD });
    expect(
      ((await challenge.clone().json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect,
    ).toBe(true);
    const verified = await post(
      "/two-factor/verify-totp",
      { code: totpFromUri(enabled.totpURI) },
      { cookie: cookieHeaderFrom(challenge).get("cookie") ?? "" },
    );
    expect(verified.status).toBe(200);
    near(sessionCookie(verified).maxAge, ADMIN_MAX_AGE);
  });

  it("a refreshed staff session past its 12 hours gets an expired cookie", async () => {
    const user = await staffUser("cookie-aged", "staff");
    const signedIn = await post("/sign-in/email", { email: user.email, password: TEST_PASSWORD });
    const cookie = cookieHeaderFrom(signedIn).get("cookie") ?? "";
    // 13 h old, and due for the library's daily refresh (expires within updateAge).
    await db()
      .update(sessions)
      .set({
        createdAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .where(eq(sessions.userId, user.id));
    const res = await authRoute.GET(
      new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie, origin: ORIGIN } }),
    );
    expect(sessionCookie(res).maxAge).toBe(0);
  });
});
