import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { createPasswordUser } from "../fixtures/auth";
import { makeActor, makeAdmin, makeShop, makeStaff } from "../fixtures/factories";

/**
 * Audit security #8: Better Auth's own account endpoints (list/revoke sessions, update user, link accounts)
 * bypass our require* policies, so staff/admin sessions that haven't passed MFA, or are past their role's limit
 * (staff 12 h, admin 2 h), must be refused there too. Driven over HTTP through auth.handler.
 */
const BASE = "http://localhost:3000/api/auth";
const HOUR = 3_600_000;

type TestHelpers = {
  login(opts: {
    userId: string;
  }): Promise<{ token: string; cookies: Array<{ name: string; value: string }> }>;
};
const helpers = async () => {
  const h = ((await auth.$context) as unknown as { test?: TestHelpers }).test;
  if (!h) throw new Error("test utilities unavailable");
  return h;
};

/** A session for the user, optionally MFA-verified and backdated (like an old browser tab). */
async function sessionFor(userId: string, opts: { mfa: boolean; ageMs?: number }) {
  const { token, cookies } = await (await helpers()).login({ userId });
  await db()
    .update(sessions)
    .set({
      mfaVerified: opts.mfa,
      ...(opts.ageMs ? { createdAt: new Date(Date.now() - opts.ageMs) } : {}),
    })
    .where(eq(sessions.token, token));
  return new Headers({ cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") });
}

const get = (path: string, headers: Headers) =>
  auth.handler(new Request(`${BASE}${path}`, { headers }));
const post = (path: string, headers: Headers, body: unknown = {}) => {
  const h = new Headers(headers);
  h.set("content-type", "application/json");
  h.set("origin", "http://localhost:3000");
  return auth.handler(
    new Request(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) }),
  );
};

async function staff() {
  const user = await createPasswordUser();
  await makeStaff((await makeShop()).id, user.id, "staff");
  return user;
}

describe("[P0-07] Better Auth account endpoints obey staff/admin MFA and session limits (security #8)", () => {
  it("a password-only staff session can't list or revoke sessions or edit the account", async () => {
    const user = await staff();
    const headers = await sessionFor(user.id, { mfa: false });

    expect((await get("/list-sessions", headers)).status).toBe(403);
    expect((await post("/revoke-other-sessions", headers)).status).toBe(403);
    expect((await post("/update-user", headers, { name: "Mallory" })).status).toBe(403);
    expect((await get("/list-accounts", headers)).status).toBe(403);
    // It can still read itself and sign out.
    expect((await get("/get-session", headers)).status).toBe(200);
    expect((await post("/sign-out", headers)).status).toBe(200);
  });

  it("an MFA-verified staff session within 12 h may use them; past 12 h it may only sign out", async () => {
    const user = await staff();
    expect((await get("/list-sessions", await sessionFor(user.id, { mfa: true }))).status).toBe(
      200,
    );

    const stale = await sessionFor(user.id, { mfa: true, ageMs: 12 * HOUR + 60_000 });
    expect((await get("/list-sessions", stale)).status).toBe(403);
    expect((await post("/update-user", stale, { name: "Late" })).status).toBe(403);
    expect((await post("/sign-out", stale)).status).toBe(200);
  });

  it("admins are cut off after 2 h", async () => {
    const user = await createPasswordUser();
    await makeAdmin(user.id, "support");
    expect(
      (await get("/list-sessions", await sessionFor(user.id, { mfa: true, ageMs: HOUR }))).status,
    ).toBe(200);
    const stale = await sessionFor(user.id, { mfa: true, ageMs: 2 * HOUR + 60_000 });
    expect((await get("/list-sessions", stale)).status).toBe(403);
  });

  it("customers are unaffected: no MFA needed, and older sessions still edit the account", async () => {
    const { user } = await makeActor("customer");
    const fresh = await sessionFor(user.id, { mfa: false, ageMs: 2 * HOUR });
    expect((await get("/list-sessions", fresh)).status).toBe(200);
    const older = await sessionFor(user.id, { mfa: false, ageMs: 20 * 24 * HOUR });
    expect((await post("/update-user", older, { name: "Casey" })).status).toBe(200);
  });

  it("the refusal is our gate (not Better Auth freshness), with a message that says what to do", async () => {
    const user = await staff();
    const res = await get("/list-sessions", await sessionFor(user.id, { mfa: false }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      message: "For your security, please sign in again with two-step verification.",
    });
  });
});

describe("[P0-07] staff/admin sessions end at their role limit everywhere, not only in shop/admin policies (review MEDIUM)", () => {
  it("pages and actions see a 12 h+ staff session, or a 2 h+ admin session, as signed out", async () => {
    const { sessionFromHeaders } = await import("@/server/auth/session");
    const staffUser = await staff();
    expect(
      await sessionFromHeaders(await sessionFor(staffUser.id, { mfa: true, ageMs: 11 * HOUR })),
    ).not.toBeNull();
    expect(
      await sessionFromHeaders(
        await sessionFor(staffUser.id, { mfa: true, ageMs: 12 * HOUR + 60_000 }),
      ),
    ).toBeNull();

    const admin = await createPasswordUser();
    await makeAdmin(admin.id, "finance");
    expect(
      await sessionFromHeaders(await sessionFor(admin.id, { mfa: true, ageMs: HOUR })),
    ).not.toBeNull();
    expect(
      await sessionFromHeaders(await sessionFor(admin.id, { mfa: true, ageMs: 2 * HOUR + 60_000 })),
    ).toBeNull();
  });

  it("customers keep their 30-day sessions", async () => {
    const { sessionFromHeaders } = await import("@/server/auth/session");
    const { user } = await makeActor("customer");
    expect(
      await sessionFromHeaders(await sessionFor(user.id, { mfa: false, ageMs: 20 * 24 * HOUR })),
    ).not.toBeNull();
  });
});
