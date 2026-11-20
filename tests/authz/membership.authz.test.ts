import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { leaveShopAction, setShopMutedAction } from "@/features/shop/actions";
import { runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { memberships } from "@/server/db/schema";
import { makeMembership, makeUser } from "@/server/testing/factories";
import { authzMatrix, type Role, world } from "./harness";

// "Leave shop" and "Mute notifications" (P1-09): any signed-in account acts on its own customer membership
// (staff and admins can be customers too, PRODUCT §2); the member always comes from the session. A caller with
// no membership of shop A gets NOT_FOUND, which the matrix counts as "the policy let it through".
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

authzMatrix("leaveShopAction", {
  allow: SIGNED_IN,
  allowCodes: ["NOT_FOUND"],
  run: async (w) => leaveShopAction({ shopId: w.shopA.id }),
});

authzMatrix("setShopMutedAction", {
  allow: SIGNED_IN,
  allowCodes: ["NOT_FOUND"],
  run: async (w) => setShopMutedAction({ shopId: w.shopA.id, muted: true }),
});

const membershipOf = async (userId: string, shopId: string) => {
  const [row] = await db()
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.shopId, shopId)));
  return row;
};

it("[P1-09] leave and mute act on the caller's own membership only: a userId in the input is refused", async () => {
  const w = await world();
  const victim = await makeUser();
  await makeMembership(victim.id, w.shopA.id);
  const calls: Array<() => Promise<unknown>> = [
    () => leaveShopAction({ shopId: w.shopA.id, userId: victim.id }),
    () => setShopMutedAction({ shopId: w.shopA.id, muted: true, userId: victim.id }),
  ];
  for (const call of calls) {
    const res = await runAsPrincipal(w.principals.customer, call);
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
  // Without the extra field the customer reaches only their own (absent) membership: NOT_FOUND, victim intact.
  const res = await runAsPrincipal(w.principals.customer, () =>
    leaveShopAction({ shopId: w.shopA.id }),
  );
  expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(await membershipOf(victim.id, w.shopA.id)).toMatchObject({ leftAt: null, muted: false });
});

it("[P1-09] leave and mute refuse a malformed shop id", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.customer, () =>
    leaveShopAction({ shopId: "not-a-uuid" }),
  );
  expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
});
