import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { makeActor } from "@/server/testing/factories";

type TestHelpers = {
  login(opts: { userId: string }): Promise<{ token: string; headers: Headers }>;
};

const DAY_MS = 86_400_000;

/** Signs a user in through Better Auth's test helper (same session record a real sign-in creates). */
async function signedInCustomer(): Promise<{ userId: string; headers: Headers; token: string }> {
  const { user } = await makeActor("customer");
  const helpers = ((await auth.$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) throw new Error("test utilities unavailable");
  const { headers, token } = await helpers.login({ userId: user.id });
  return { userId: user.id, headers, token };
}

const sessionFor = (headers: Headers) =>
  auth.api.getSession({ headers, query: { disableCookieCache: true } });

afterEach(() => {
  vi.useRealTimers();
});

describe("[P0-06] customer session idle timeout: 30 days (injected clock)", () => {
  it("a session unused for more than 30 days is no longer accepted", async () => {
    const start = new Date("2026-11-09T10:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"], now: start });
    const { headers } = await signedInCustomer();
    expect(await sessionFor(headers)).not.toBeNull();

    vi.setSystemTime(start.getTime() + 30 * DAY_MS + 60_000);
    expect(await sessionFor(headers)).toBeNull();
  });

  it("using the app keeps it alive: activity within 30 days pushes the expiry forward (idle, not absolute)", async () => {
    const start = new Date("2026-11-09T10:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"], now: start });
    const { headers, token } = await signedInCustomer();

    vi.setSystemTime(start.getTime() + 20 * DAY_MS); // active on day 20 (past the 1-day refresh age)
    expect(await sessionFor(headers)).not.toBeNull();
    const [row] = await db().select().from(sessions).where(eq(sessions.token, token));
    expect(row?.expiresAt.getTime()).toBeGreaterThan(start.getTime() + 49 * DAY_MS);

    vi.setSystemTime(start.getTime() + 45 * DAY_MS); // 25 days after the last use
    expect(await sessionFor(headers)).not.toBeNull();
  });
});

describe("[P0-06] user deleted mid-session", () => {
  it("the next request is signed out and the session rows are gone", async () => {
    const { userId, headers } = await signedInCustomer();
    expect(await sessionFor(headers)).not.toBeNull();

    await db().delete(users).where(eq(users.id, userId));

    expect(await sessionFor(headers)).toBeNull();
    expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
  });
});
