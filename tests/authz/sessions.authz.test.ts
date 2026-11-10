import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { signOutAllDevices, signOutOtherDevice } from "@/features/auth/session-actions";
import { newId } from "@/lib/id";
import { runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { authzMatrix, type Role, world } from "./harness";

// Every signed-in user manages their own devices (no MFA needed: it can only reduce access). Anonymous is denied.
const SIGNED_IN: Role[] = [
  "customer",
  "staff_other_shop",
  "owner_other_shop",
  "staff_own_shop",
  "owner_own_shop",
  "owner_own_shop_no_mfa",
  "staff_own_shop_inactive",
  "admin_owner",
  "admin_support",
  "admin_moderator",
  "admin_finance",
  "admin_owner_no_mfa",
];

authzMatrix("signOutOtherDevice", {
  allow: SIGNED_IN,
  // A random id is never the caller's session: allowed roles get NOT_FOUND, never a denial.
  allowCodes: ["NOT_FOUND"],
  run: () => signOutOtherDevice({ sessionId: newId() }),
});

authzMatrix("signOutAllDevices", {
  allow: SIGNED_IN,
  run: () => signOutAllDevices({}),
});

it("[P0-06] signOutOtherDevice cannot end another user's session (the user id comes from the session)", async () => {
  const w = await world();
  const victim = w.principals.admin_owner;
  if (!victim) throw new Error("world has no admin owner");
  const [row] = await db()
    .insert(sessions)
    .values({
      userId: victim.userId,
      token: `t_${newId()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning({ id: sessions.id });
  if (!row) throw new Error("no session row");

  const res = await runAsPrincipal(w.principals.customer, () =>
    signOutOtherDevice({ sessionId: row.id }),
  );

  expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(await db().select().from(sessions).where(eq(sessions.id, row.id))).toHaveLength(1);
});

it("[P0-06] signOutOtherDevice rejects a malformed id before touching data", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.customer, () =>
    signOutOtherDevice({ sessionId: "'; DROP TABLE sessions; --" }),
  );
  expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
});
