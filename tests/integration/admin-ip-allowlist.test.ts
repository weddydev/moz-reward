import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { STAFF_LOGIN } from "@/server/auth/staff-login";
import { testOwnerDb as db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import type * as EnvModule from "@/server/env";
import { parseAdminAllowlist } from "@/server/security/admin-allowlist";
import { securityAlert } from "@/server/security/alert";
import type * as RequestModule from "@/server/security/request";
import { hashIp } from "@/server/services/audit";
import { markSessionMfaVerified } from "@/server/testing/factories";
import { TEST_PASSWORD, testEmail } from "../fixtures/auth";
import { makeAdmin, makeShop, makeStaff, makeUser } from "../fixtures/factories";

/**
 * C-24 (P0-12): ADMIN_IP_ALLOWLIST at sign-in and on Better Auth's account endpoints. The client address is
 * read as behind Caddy (X-Forwarded-For), so each request names its own address.
 */
vi.mock("@/server/security/request", async (importOriginal) => {
  const actual = await importOriginal<typeof RequestModule>();
  return { ...actual, clientIp: (headers: Headers) => actual.clientIp(headers, "caddy") };
});
const state = vi.hoisted(() => ({ list: undefined as string | undefined }));
vi.mock("@/server/env", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    ...actual,
    env: () => {
      const parsed = parseAdminAllowlist(state.list);
      if (!parsed.ok) throw new Error(parsed.error);
      return { ...actual.env(), ADMIN_IP_ALLOWLIST: parsed.list };
    },
  };
});
vi.mock("@/server/security/alert", () => ({ securityAlert: vi.fn(), opsAlert: vi.fn() }));

afterEach(() => {
  state.list = undefined;
  vi.mocked(securityAlert).mockClear();
});

const ORIGIN = "http://localhost:3000";
const LIST = "203.0.113.0/24, 2001:db8:a11::/48";
const onList = (): string => `203.0.113.${String(1 + Math.floor(Math.random() * 250))}`;
/** Off-list, unique per call (limiter state outlives a run): a random /64 in the documentation range. */
const offList = (): string => `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`;
const WRONG = "wrong-password-123";

const signIn = (email: string, password: string, from: string): Promise<Response> =>
  getAuth().handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": from },
      body: JSON.stringify({ email, password }),
    }),
  );

const hasSession = (res: Response): boolean =>
  res.headers.getSetCookie().some((c) => c.includes("session_token="));

async function admin(label: string, alsoStaff = false): Promise<{ id: string; email: string }> {
  const user = await makeUser({ email: testEmail(label) });
  await makeAdmin(user.id, "support");
  if (alsoStaff) await makeStaff((await makeShop()).id, user.id, "staff");
  return { id: user.id, email: user.email };
}

const failedAudit = async (userId: string) =>
  db()
    .select({ meta: auditLogs.meta })
    .from(auditLogs)
    .where(and(eq(auditLogs.entityId, userId), eq(auditLogs.action, "auth.sign_in_failed")))
    .orderBy(desc(auditLogs.at));

describe("[P0-12] C-24 admin IP allowlist at sign-in", () => {
  it("unset: an admin signs in from anywhere", async () => {
    const a = await admin("allow-unset");
    const res = await signIn(a.email, TEST_PASSWORD, offList());
    expect(res.status).toBe(200);
  });

  it("set: the right password from an off-list address answers exactly like a wrong one", async () => {
    state.list = LIST;
    const a = await admin("allow-off");
    const right = await signIn(a.email, TEST_PASSWORD, offList());
    const wrong = await signIn(a.email, WRONG, offList());
    expect(right.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await right.json()).toEqual(await wrong.json());
    expect([...right.headers.keys()].sort()).toEqual([...wrong.headers.keys()].sort());
    expect(hasSession(right)).toBe(false);
    // Audited with the reason; both developers alerted with the user id and a hashed address only.
    await vi.waitFor(async () => {
      const metas = (await failedAudit(a.id)).map((r) => r.meta);
      expect(metas).toContainEqual({
        factor: "password",
        role: "admin",
        reason: "admin-ip-allowlist",
      });
    });
    const call = vi.mocked(securityAlert).mock.calls.find((c) => c[0] === "auth.admin_ip_denied");
    expect(call?.[1]).toMatchObject({ userId: a.id, where: "password" });
    expect(Object.keys(call?.[1] ?? {}).sort()).toEqual(["ipHash", "userId", "where"]);
  });

  it("set: an on-list address (incl. its IPv4-mapped IPv6 form) signs in", async () => {
    state.list = LIST;
    const a = await admin("allow-on");
    expect((await signIn(a.email, TEST_PASSWORD, onList())).status).toBe(200);
    expect((await signIn(a.email, TEST_PASSWORD, `::ffff:${onList()}`)).status).toBe(200);
    expect((await signIn(a.email, TEST_PASSWORD, "2001:db8:a11:5::9")).status).toBe(200);
  });

  it("set: an admin who is also shop staff is refused entirely; plain staff are not affected", async () => {
    state.list = LIST;
    const both = await admin("allow-both", true);
    expect((await signIn(both.email, TEST_PASSWORD, offList())).status).toBe(401);
    const user = await makeUser({ email: testEmail("allow-staff") });
    await makeStaff((await makeShop()).id, user.id, "staff");
    expect((await signIn(user.email, TEST_PASSWORD, offList())).status).toBe(200);
  });

  it("set: refused attempts count like wrong passwords, through the 6th attempt, from one address or many", async () => {
    state.list = LIST;
    const { lockAfter } = STAFF_LOGIN.password;
    // The same sequence for an off-list admin with the right password and a staff member with a wrong one.
    const run = async (email: string, password: string, sameAddress: boolean) => {
      const from = offList();
      const out: [number, unknown][] = [];
      for (let i = 0; i <= lockAfter; i++) {
        const res = await signIn(email, password, sameAddress ? from : offList());
        out.push([res.status, ((await res.json()) as { code?: unknown }).code]);
      }
      return out;
    };
    for (const sameAddress of [true, false]) {
      const a = await admin(`allow-count-${String(sameAddress)}`);
      const s = await makeUser({ email: testEmail(`allow-count-s-${String(sameAddress)}`) });
      await makeStaff((await makeShop()).id, s.id, "staff");
      const refused = await run(a.email, TEST_PASSWORD, sameAddress);
      expect(refused).toEqual(await run(s.email, WRONG, sameAddress));
      expect(refused.slice(0, lockAfter).every(([status]) => status === 401)).toBe(true);
      expect(refused[lockAfter]?.[0]).not.toBe(200);
    }
  });

  it("set: no admin session is made without a request address (server-side session creation)", async () => {
    const helpers = (
      (await getAuth().$context) as unknown as {
        test: { login(o: { userId: string }): Promise<{ token: string }> };
      }
    ).test;
    const a = await admin("allow-session");
    state.list = LIST;
    await expect(helpers.login({ userId: a.id })).rejects.toThrow();
    // A customer is unaffected.
    const c = await makeUser({ email: testEmail("allow-session-c"), password: null });
    expect((await helpers.login({ userId: c.id })).token).toEqual(expect.stringMatching(/.+/));
    await vi.waitFor(async () => {
      const metas = (await failedAudit(a.id)).map((r) => r.meta);
      expect(metas).toContainEqual({
        factor: "session",
        role: "admin",
        reason: "admin-ip-allowlist",
      });
    });
  });

  it("set: a signed-in admin's cookie gets 403 on the account endpoints from off-list, not from on-list", async () => {
    const helpers = (
      (await getAuth().$context) as unknown as {
        test: {
          login(o: {
            userId: string;
          }): Promise<{ token: string; cookies: { name: string; value: string }[] }>;
        };
      }
    ).test;
    const a = await admin("allow-account");
    const login = await helpers.login({ userId: a.id });
    await markSessionMfaVerified(login.token);
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    state.list = LIST;
    const updateName = (from: string): Promise<Response> =>
      getAuth().handler(
        new Request(`${ORIGIN}/api/auth/update-user`, {
          method: "POST",
          headers: {
            origin: ORIGIN,
            cookie,
            "content-type": "application/json",
            "x-forwarded-for": from,
          },
          body: JSON.stringify({ name: "Renamed Admin" }),
        }),
      );
    const off = offList();
    expect((await updateName(off)).status).toBe(403);
    expect((await updateName(onList())).status).toBe(200);
    const call = vi.mocked(securityAlert).mock.calls.find((c) => c[0] === "auth.admin_ip_denied");
    expect(call?.[1]).toEqual({ userId: a.id, ipHash: hashIp(off), where: "account" });
  });
});
