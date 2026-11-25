import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { requestPointsAction } from "@/features/shop/actions";
import { newId } from "@/lib/id";
import { runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { pointRequests } from "@/server/db/schema";
import { makeMembership, makeProgramme, makeUser } from "@/server/testing/factories";
import { authzMatrix, type Role, world } from "./harness";

// "Request points" (P1-11): any signed-in account asks on its own customer membership (staff and admins can be
// customers too, PRODUCT §2); the member always comes from the session. A caller with no membership of shop A
// gets NOT_FOUND, which the matrix counts as "the policy let it through".
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

authzMatrix("requestPointsAction", {
  allow: SIGNED_IN,
  allowCodes: ["NOT_FOUND"],
  run: async (w) => requestPointsAction({ shopId: w.shopA.id, idempotencyKey: newId() }),
});

it("[P1-11] request points acts on the caller's own membership only: a userId or membershipId in the input is refused", async () => {
  const w = await world();
  await makeProgramme(w.shopA.id);
  const victim = await makeUser();
  await makeMembership(victim.id, w.shopA.id);
  for (const extra of [{ userId: victim.id }, { membershipId: newId() }, { status: "approved" }]) {
    const res = await runAsPrincipal(w.principals.customer, () =>
      requestPointsAction({ shopId: w.shopA.id, idempotencyKey: newId(), ...extra }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
  // Without the extra fields the customer reaches only their own (absent) membership: NOT_FOUND, nothing written.
  const res = await runAsPrincipal(w.principals.customer, () =>
    requestPointsAction({ shopId: w.shopA.id, idempotencyKey: newId() }),
  );
  expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(
    await db().select().from(pointRequests).where(eq(pointRequests.userId, victim.id)),
  ).toEqual([]);
});

it("[P1-11] request points refuses a malformed shop id, key or client time", async () => {
  const w = await world();
  for (const input of [
    { shopId: "not-a-uuid", idempotencyKey: newId() },
    { shopId: w.shopA.id, idempotencyKey: "tap-1" },
    { shopId: w.shopA.id, idempotencyKey: newId(), clientRequestedAt: "yesterday" },
  ]) {
    const res = await runAsPrincipal(w.principals.customer, () => requestPointsAction(input));
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
});
