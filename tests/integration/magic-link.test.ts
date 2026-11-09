import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { TURNSTILE_BYPASS_TOKEN } from "@/lib/turnstile";
import { auth } from "@/server/auth/auth";
import { checkMagicLinkRequest } from "@/server/auth/magic-link";
import { db } from "@/server/db/client";
import { verifications } from "@/server/db/schema";
import { createRedis } from "@/server/jobs/connection";
import { testEmail } from "../fixtures/auth";
import { makeShop, makeStaff, makeUser } from "../fixtures/factories";
import { countEmailsTo, firstLink, latestEmailTo } from "../support/mailpit";

const ORIGIN = "http://localhost:3000";
const ip = (): string => `198.51.100.${String(Math.floor(Math.random() * 250) + 1)}`;

/** Through the real HTTP handler, as the browser does (hooks see ctx.request). */
const requestLink = (
  email: string,
  headers: Record<string, string> = { "x-turnstile-token": TURNSTILE_BYPASS_TOKEN },
): Promise<Response> =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
      body: JSON.stringify({
        email,
        callbackURL: "/wallet",
        errorCallbackURL: "/sign-in/link-expired",
      }),
    }),
  );

describe("[P0-06] magic-link request checks (Turnstile + SECURITY §6 limits)", () => {
  it("requires a Turnstile token (bypass token accepted only in test)", async () => {
    const email = testEmail("captcha");
    expect(await checkMagicLinkRequest({ email, ip: ip(), turnstileToken: null })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await checkMagicLinkRequest({ email, ip: ip(), turnstileToken: TURNSTILE_BYPASS_TOKEN }),
    ).toEqual({ ok: true });
  });

  it("limits 5 per hour per email, treating case and spaces as the same address", async () => {
    const email = testEmail("limit");
    const variants = [email, email.toUpperCase(), ` ${email} `, email, email];
    for (const v of variants) {
      expect(
        await checkMagicLinkRequest({ email: v, ip: ip(), turnstileToken: TURNSTILE_BYPASS_TOKEN }),
      ).toEqual({ ok: true });
    }
    expect(
      await checkMagicLinkRequest({ email, ip: ip(), turnstileToken: TURNSTILE_BYPASS_TOKEN }),
    ).toMatchObject({ ok: false, status: 429 });
  });

  it("limits 20 per hour per IP across different emails", async () => {
    const from = ip();
    for (let i = 0; i < 20; i++) {
      const r = await checkMagicLinkRequest({
        email: testEmail(`ip${String(i)}`),
        ip: from,
        turnstileToken: TURNSTILE_BYPASS_TOKEN,
      });
      expect(r.ok).toBe(true);
    }
    expect(
      await checkMagicLinkRequest({
        email: testEmail("ip-over"),
        ip: from,
        turnstileToken: TURNSTILE_BYPASS_TOKEN,
      }),
    ).toMatchObject({ ok: false, status: 429 });
  });

  it("never puts the email address in a Redis key", async () => {
    const email = testEmail("keyprivacy");
    await checkMagicLinkRequest({ email, ip: ip(), turnstileToken: TURNSTILE_BYPASS_TOKEN });
    const redis = createRedis("limiter");
    const keys = await redis.keys("*magic-link*");
    await redis.quit();
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.includes(email) || k.includes("@"))).toBe(false);
  });
});

describe("[P0-06] magic-link over HTTP", () => {
  it("without a Turnstile token: 400 and no email", async () => {
    const email = testEmail("nocaptcha");
    const res = await requestLink(email, {});
    expect(res.status).toBe(400);
    const customer = testEmail("after-nocaptcha");
    await requestLink(customer);
    await latestEmailTo(customer); // later mail arrived, so the first would have too
    expect(await countEmailsTo(email)).toBe(0);
  });

  it("known, unknown and staff emails get the identical status and body", async () => {
    const known = await makeUser({ email: testEmail("known"), password: null });
    const staff = await makeUser({ email: testEmail("staffer") });
    await makeStaff((await makeShop()).id, staff.id, "staff");
    const responses = await Promise.all(
      [known.email, testEmail("unknown"), staff.email].map(async (e) => {
        const r = await requestLink(e);
        return { status: r.status, body: await r.text() };
      }),
    );
    expect(responses[0]?.status).toBe(200);
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);
  });

  it("sends a branded HTML + text email; the stored token is hashed, not the one in the link", async () => {
    const email = testEmail("html");
    expect((await requestLink(email)).status).toBe(200);
    const message = await latestEmailTo(email);
    expect(message.subject).toBe("Your Moz Rewards sign-in link");
    const link = firstLink(message.text) ?? "";
    const token = new URL(link).searchParams.get("token") ?? "";
    expect(token.length).toBeGreaterThan(16);
    expect(message.html).toContain("Moz Rewards");
    expect(message.html).toContain(token);
    expect(message.text).toMatch(/15 minutes/);
    const rows = await db().select().from(verifications);
    expect(rows.some((r) => r.identifier === token || r.value.includes(token))).toBe(false);
  });

  it("an expired or already-used link redirects to the friendly page", async () => {
    const email = testEmail("expired");
    await requestLink(email);
    const link = firstLink((await latestEmailTo(email)).text) ?? "";

    // Used once: second use goes to the error page.
    const first = await auth.handler(new Request(link, { headers: { origin: ORIGIN } }));
    expect(first.status).toBe(302);
    const reuse = await auth.handler(new Request(link, { headers: { origin: ORIGIN } }));
    expect(reuse.headers.get("location")).toMatch(/\/sign-in\/link-expired\?error=/);

    // Expired: push the stored expiry into the past.
    const email2 = testEmail("expired2");
    await requestLink(email2);
    const link2 = firstLink((await latestEmailTo(email2)).text) ?? "";
    await db()
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verifications.expiresAt, verifications.expiresAt));
    const expired = await auth.handler(new Request(link2, { headers: { origin: ORIGIN } }));
    expect(expired.headers.get("location")).toMatch(/\/sign-in\/link-expired\?error=/);
    expect(expired.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
  });
});
