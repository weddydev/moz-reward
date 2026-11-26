import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { confirmRedeemCodeAction, createRedeemCodeAction } from "@/features/rewards/actions";
import { newId } from "@/lib/id";
import { runAsPrincipal } from "@/server/authz/principal";
import { mintCustomerScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { loyaltyPrograms, redemptionCodes, shops } from "@/server/db/schema";
import { transaction } from "@/server/repos/_base";
import { createRedemptionCode } from "@/server/services/redemptions";
import { makeMembership, makeProgramme, makeUser } from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";
import { authzMatrix, type Role, world } from "./harness";

// Rewards and redemption (P1-16). Redeem: any signed-in account, on its own reward only (staff and admins can be
// customers too, PRODUCT §2); a random reward id is NOT_FOUND, counted as "let through". Confirm: the shop's
// active team (staff and owner with TOTP) in its own shop only; every admin role is refused (there is no
// view-as-shop yet; P2-12 adds it read-only). A wrong code is NOT_FOUND, counted as "let through".
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

authzMatrix("createRedeemCodeAction", {
  allow: SIGNED_IN,
  allowCodes: ["NOT_FOUND"],
  run: () => createRedeemCodeAction({ rewardId: newId() }),
});

authzMatrix("confirmRedeemCodeAction", {
  allow: ["staff_own_shop", "owner_own_shop"],
  allowCodes: ["NOT_FOUND"],
  run: (w) => confirmRedeemCodeAction({ shopId: w.shopA.id, code: "ZZZZZZ" }),
});

async function liveCode(shopId: string) {
  // The harness reuses one world per file: the programme is made once.
  const [has] = await db()
    .select({ id: loyaltyPrograms.id })
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.shopId, shopId));
  if (!has) await makeProgramme(shopId, 1_000, { milestones: [], streak: null });
  const customer = await makeUser();
  const m = await makeMembership(customer.id, shopId, { progressGold: 950 });
  const visit = await approvedVisit(m, { seen: true });
  const scope = mintCustomerScope({ userId: customer.id });
  return transaction(scope, (tx) => createRedemptionCode(scope, visit.rewardIds[0]!, tx));
}

it("[P1-16] another shop's team can't confirm shop A's code, even naming its own shop", async () => {
  const w = await world();
  const r = await liveCode(w.shopA.id);
  for (const role of ["staff_other_shop", "owner_other_shop"] as const) {
    const res = await runAsPrincipal(w.principals[role], () =>
      confirmRedeemCodeAction({ shopId: w.shopB.id, code: r.code }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const named = await runAsPrincipal(w.principals[role], () =>
      confirmRedeemCodeAction({ shopId: w.shopA.id, code: r.code }),
    );
    expect(named).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  }
  const [row] = await db().select().from(redemptionCodes).where(eq(redemptionCodes.id, r.codeId));
  expect(row?.status).toBe("live");
  const ok = await runAsPrincipal(w.principals.staff_own_shop, () =>
    confirmRedeemCodeAction({ shopId: w.shopA.id, code: r.code }),
  );
  expect(ok).toMatchObject({ ok: true, data: { redemptionId: r.codeId } });
});

it("[P1-16] a closed shop's team still confirms codes in its 30 days", async () => {
  const w = await world();
  const r = await liveCode(w.shopA.id);
  await db().update(shops).set({ status: "closed" }).where(eq(shops.id, w.shopA.id));
  await db()
    .update(shops)
    .set({ closedAt: new Date(Date.now() - 10 * 86_400_000) })
    .where(eq(shops.id, w.shopA.id));
  const ok = await runAsPrincipal(w.principals.owner_own_shop, () =>
    confirmRedeemCodeAction({ shopId: w.shopA.id, code: r.code }),
  );
  expect(ok).toMatchObject({ ok: true });
});

it("[P1-16] the inputs take no member, reward, status or confirmer; a code is bounded before it is read", async () => {
  const w = await world();
  for (const input of [
    { rewardId: newId(), membershipId: newId() },
    { rewardId: newId(), userId: newId() },
    { rewardId: "not-a-uuid" },
  ]) {
    const res = await runAsPrincipal(w.principals.customer, () =>
      createRedeemCodeAction(input as { rewardId: string }),
    );
    expect(res, JSON.stringify(input)).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
  for (const input of [
    { shopId: w.shopA.id, code: "x".repeat(17) },
    { shopId: w.shopA.id, code: "ZZZZZZ", confirmedBy: newId() },
    { shopId: w.shopA.id, code: "ZZZZZZ", rewardId: newId() },
  ]) {
    const res = await runAsPrincipal(w.principals.staff_own_shop, () =>
      confirmRedeemCodeAction(input as { shopId: string; code: string }),
    );
    expect(res, JSON.stringify(input)).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
});
