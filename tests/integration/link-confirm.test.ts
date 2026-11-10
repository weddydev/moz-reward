import { describe, expect, it, vi } from "vitest";
import * as authRoute from "@/app/api/auth/[...all]/route";
import { TURNSTILE_BYPASS_TOKEN } from "@/lib/turnstile";
import { testOwnerDb as db } from "@/server/db/client";
import { verifications } from "@/server/db/schema";
import type * as AuthLimit from "@/server/security/auth-limit";
import { confirmSignInLink, testEmail } from "../fixtures/auth";
import { makeShop, makeStaff, makeUser } from "../fixtures/factories";
import { firstLink, latestEmailTo } from "../support/mailpit";

// The blanket auth limit is real everywhere except where a test sets an outcome (busy / Redis down).
const limitState = vi.hoisted(() => ({ outcome: null as null | 429 | 503 }));
vi.mock("@/server/security/auth-limit", async (actual) => {
  const real = await actual<typeof AuthLimit>();
  return {
    ...real,
    authRequestLimit: (...args: Parameters<typeof real.authRequestLimit>) =>
      limitState.outcome === null
        ? real.authRequestLimit(...args)
        : Promise.resolve(
            Response.json({}, { status: limitState.outcome, headers: { "Retry-After": "42" } }),
          ),
  };
});

const ORIGIN = "http://localhost:3000";

/** Through our /api/auth route, as the browser does. */
async function emailedLink(email: string, callbackURL = "/wallet"): Promise<string> {
  const res = await authRoute.POST(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-turnstile-token": TURNSTILE_BYPASS_TOKEN,
      },
      body: JSON.stringify({ email, callbackURL, errorCallbackURL: "/sign-in/link-expired" }),
    }),
  );
  expect(res.status).toBe(200);
  return firstLink((await latestEmailTo(email)).text) ?? "";
}

const pendingTokens = async (): Promise<number> =>
  (await db().select().from(verifications)).filter((v) => v.identifier.startsWith("magic-link"))
    .length;
const hasSessionCookie = (res: Response): boolean =>
  res.headers.getSetCookie().some((c) => c.includes("session_token="));

describe("[P0-19] sign-in link: GET never consumes, POST confirms once (AC3)", () => {
  it("the email links to our confirm page with only a token and a safe return path", async () => {
    const link = new URL(await emailedLink(testEmail("confirm-shape"), "/me/security"));
    expect(`${link.origin}${link.pathname}`).toBe(`${ORIGIN}/sign-in/confirm`);
    expect([...link.searchParams.keys()].sort()).toEqual(["returnTo", "token"]);
    expect(link.searchParams.get("returnTo")).toBe("/me/security");
    // The default destination is implied, not spelled out.
    const plain = new URL(await emailedLink(testEmail("confirm-default")));
    expect([...plain.searchParams.keys()]).toEqual(["token"]);
  });

  it("mail-scanner simulation: GETs of the library's verify URL are 404 and consume nothing; the click signs in once", async () => {
    const link = await emailedLink(testEmail("scanner"));
    const token = new URL(link).searchParams.get("token") ?? "";
    const before = await pendingTokens();

    // What a scanner could try: the old library URL, with and without a callback.
    for (const q of [`token=${token}`, `token=${token}&callbackURL=%2Fwallet`]) {
      const res = await authRoute.GET(new Request(`${ORIGIN}/api/auth/magic-link/verify?${q}`));
      expect(res.status).toBe(404);
      expect(hasSessionCookie(res)).toBe(false);
    }
    expect(await pendingTokens()).toBe(before);

    const click = await confirmSignInLink(link);
    expect(click.status).toBe(303);
    expect(click.headers.get("location")).toBe(`${ORIGIN}/wallet`);
    expect(hasSessionCookie(click)).toBe(true);
    expect(click.headers.get("cache-control")).toBe("no-store");
    expect(await pendingTokens()).toBe(before - 1);

    const again = await confirmSignInLink(link);
    expect(again.headers.get("location")).toMatch(/\/sign-in\/link-expired\?error=/);
    expect(hasSessionCookie(again)).toBe(false);
  });

  it("a cross-site POST is refused and leaves the token usable", async () => {
    const link = await emailedLink(testEmail("csrf"));
    const forged = await confirmSignInLink(link, { origin: "https://evil.example" });
    expect(forged.status).toBe(403);
    expect(hasSessionCookie(forged)).toBe(false);
    expect((await confirmSignInLink(link)).headers.get("location")).toBe(`${ORIGIN}/wallet`);
  });

  it("an open-redirect return path falls back to the wallet", async () => {
    const link = new URL(await emailedLink(testEmail("redirect")));
    link.searchParams.set("returnTo", "//evil.example/x");
    const res = await confirmSignInLink(link.toString());
    expect(res.headers.get("location")).toBe(`${ORIGIN}/wallet`);
  });

  it("a missing or malformed token goes to the expired page without a lookup or a cookie", async () => {
    for (const bad of ["", "short", "a".repeat(300), "<script>alert(1)</script>xxxxxxxx"]) {
      const res = await confirmSignInLink(
        `${ORIGIN}/sign-in/confirm?token=${encodeURIComponent(bad)}`,
      );
      expect(res.status, bad).toBe(303);
      expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in/link-expired`);
      expect(hasSessionCookie(res)).toBe(false);
    }
  });

  it("a link issued before the account became staff lands on the staff explanation", async () => {
    const user = await makeUser({ email: testEmail("confirm-promoted"), password: null });
    const link = await emailedLink(user.email);
    await makeStaff((await makeShop()).id, user.id, "staff");
    const res = await confirmSignInLink(link);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in/link-expired?error=FORBIDDEN`);
    expect(hasSessionCookie(res)).toBe(false);
  });

  it("rate limited or Redis down: back to the confirm page with a retry notice; the token is kept", async () => {
    const link = await emailedLink(testEmail("confirm-busy"), "/me/security");
    const before = await pendingTokens();
    for (const [outcome, retry] of [
      [429, "busy"],
      [503, "unavailable"],
    ] as const) {
      limitState.outcome = outcome;
      try {
        const res = await confirmSignInLink(link);
        expect(res.status).toBe(303);
        expect(res.headers.get("retry-after")).toBe("42");
        const back = new URL(res.headers.get("location") ?? "");
        expect(back.pathname).toBe("/sign-in/confirm");
        expect(back.searchParams.get("retry")).toBe(retry);
        expect(back.searchParams.get("returnTo")).toBe("/me/security");
        expect(back.searchParams.get("token")).toBe(new URL(link).searchParams.get("token"));
      } finally {
        limitState.outcome = null;
      }
    }
    expect(await pendingTokens()).toBe(before);
    expect((await confirmSignInLink(link)).headers.get("location")).toBe(`${ORIGIN}/me/security`);
  });

  it("OAuth errors land on our sign-in page, and the library's /error page is blocked", async () => {
    expect((await authRoute.GET(new Request(`${ORIGIN}/api/auth/error`))).status).toBe(404);
    // A callback with a forged state can't recover an errorCallbackURL: it falls back to onAPIError.errorURL.
    const res = await authRoute.GET(
      new Request(`${ORIGIN}/api/auth/callback/google?state=forged&code=x`),
    );
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location") ?? "");
    expect(`${to.origin}${to.pathname}`).toBe(`${ORIGIN}/sign-in`);
    expect(to.searchParams.get("error")).toBeTruthy();
  });
});
