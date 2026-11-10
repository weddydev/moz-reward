import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintCustomerScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { listSignedInDevices, signOutDevice, signOutEverywhere } from "@/server/services/sessions";
import { makeUser } from "@/server/testing/factories";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function addSession(
  userId: string,
  opts: { userAgent?: string | null; lastActive?: Date; expiresAt?: Date } = {},
): Promise<string> {
  const [row] = await db()
    .insert(sessions)
    .values({
      userId,
      token: `t_${newId()}`,
      userAgent: opts.userAgent ?? null,
      ipAddress: "203.0.113.9",
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 86_400_000),
      // set_updated_at() runs on UPDATE only, so an insert can place "last active" in the past.
      ...(opts.lastActive ? { createdAt: opts.lastActive, updatedAt: opts.lastActive } : {}),
    })
    .returning({ id: sessions.id });
  if (!row) throw new Error("no session row");
  return row.id;
}

const remaining = async (userId: string) =>
  (await db().select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))).map(
    (r) => r.id,
  );

describe("[P0-06] signed-in devices list", () => {
  it("lists only the caller's live sessions: this device first, then most recently active, with readable names", async () => {
    const user = await makeUser({ password: null });
    const other = await makeUser({ password: null });
    const old = await addSession(user.id, {
      userAgent: WINDOWS,
      lastActive: new Date(Date.now() - 5 * 86_400_000),
    });
    const recent = await addSession(user.id, { userAgent: IPHONE });
    const current = await addSession(user.id, {
      userAgent: null,
      lastActive: new Date(Date.now() - 10 * 86_400_000),
    });
    await addSession(user.id, { expiresAt: new Date(Date.now() - 1000) }); // expired
    await addSession(other.id, { userAgent: IPHONE }); // someone else's

    const list = await listSignedInDevices(mintCustomerScope({ userId: user.id }), current);

    expect(list.map((d) => d.id)).toEqual([current, recent, old]);
    expect(list.map((d) => d.device)).toEqual([
      "Unknown device",
      "Safari on iPhone",
      "Chrome on Windows",
    ]);
    expect(list.map((d) => d.current)).toEqual([true, false, false]);
    // Nothing that could act as a credential or locate the person leaves the server.
    expect(JSON.stringify(list)).not.toMatch(/t_|203\.0\.113\.9/);
  });

  it("signs one other device out", async () => {
    const user = await makeUser({ password: null });
    const current = await addSession(user.id);
    const phone = await addSession(user.id, { userAgent: IPHONE });
    const scope = mintCustomerScope({ userId: user.id });

    await signOutDevice(scope, current, phone);

    expect(await remaining(user.id)).toEqual([current]);
  });

  it("cannot sign out another user's session, and says the same as for a session already gone", async () => {
    const user = await makeUser({ password: null });
    const victim = await makeUser({ password: null });
    const current = await addSession(user.id);
    const victimSession = await addSession(victim.id);
    const scope = mintCustomerScope({ userId: user.id });

    const foreign = signOutDevice(scope, current, victimSession);
    await expect(foreign).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(signOutDevice(scope, current, newId())).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "That device is already signed out.",
    });
    expect(await remaining(victim.id)).toEqual([victimSession]);
  });

  it("refuses to treat this device as an 'other' device", async () => {
    const user = await makeUser({ password: null });
    const current = await addSession(user.id);
    await expect(
      signOutDevice(mintCustomerScope({ userId: user.id }), current, current),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await remaining(user.id)).toEqual([current]);
  });

  it("sign out everywhere ends every session of the caller, this one included, and no one else's", async () => {
    const user = await makeUser({ password: null });
    const other = await makeUser({ password: null });
    await addSession(user.id);
    await addSession(user.id, { userAgent: IPHONE });
    const keep = await addSession(other.id);

    expect(await signOutEverywhere(mintCustomerScope({ userId: user.id }))).toBe(2);

    expect(await remaining(user.id)).toEqual([]);
    expect(await remaining(other.id)).toEqual([keep]);
  });
});
