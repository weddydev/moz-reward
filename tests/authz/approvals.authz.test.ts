import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import {
  approveRequestAction,
  ownerApproveAction,
  rejectRequestAction,
  reverseAwardAction,
  scanAwardAction,
} from "@/features/requests/actions";
import { newId } from "@/lib/id";
import { runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { ledgerEntries, loyaltyPrograms, pointRequests } from "@/server/db/schema";
import { memberQrKeys, signMemberQr } from "@/server/security/member-qr";
import {
  makeCustomerProfile,
  makeMembership,
  makeProgramme,
  makeUser,
} from "@/server/testing/factories";
import { authzMatrix, type Role, world } from "./harness";

// Request decisions (P1-12): the shop's active team (staff and owner, with TOTP); the owner alone for an award
// waiting for them. A random request or receipt id gets NOT_FOUND, which the matrix counts as "let through".
const TEAM: Role[] = ["staff_own_shop", "owner_own_shop"];

authzMatrix("approveRequestAction", {
  allow: TEAM,
  allowCodes: ["NOT_FOUND"],
  run: (w) => approveRequestAction({ shopId: w.shopA.id, requestId: newId() }),
});

authzMatrix("ownerApproveAction", {
  allow: ["owner_own_shop"],
  allowCodes: ["NOT_FOUND"],
  run: (w) => ownerApproveAction({ shopId: w.shopA.id, requestId: newId(), amountPence: 500 }),
});

authzMatrix("rejectRequestAction", {
  allow: TEAM,
  allowCodes: ["NOT_FOUND"],
  run: (w) =>
    rejectRequestAction({ shopId: w.shopA.id, requestId: newId(), reason: "no_purchase" }),
});

// P2-02 scan award: the shop's active team. An unknown member ID gets NOT_FOUND ("not a member yet").
authzMatrix("scanAwardAction", {
  allow: TEAM,
  allowCodes: ["NOT_FOUND"],
  run: (w) =>
    scanAwardAction({
      shopId: w.shopA.id,
      member: { memberId: "ZZZ-ZZZ" },
      idempotencyKey: newId(),
      amountPence: 500,
    }),
});

authzMatrix("reverseAwardAction", {
  allow: TEAM,
  allowCodes: ["NOT_FOUND"],
  run: (w) => reverseAwardAction({ shopId: w.shopA.id, receiptId: newId(), reason: "refund" }),
});

it("[P1-12] another shop's team can't decide shop A's request by naming its own shop", async () => {
  const w = await world();
  await makeProgramme(w.shopA.id);
  const customer = await makeUser();
  const m = await makeMembership(customer.id, w.shopA.id);
  const [r] = await db()
    .insert(pointRequests)
    .values({
      membershipId: m.id,
      userId: customer.id,
      shopId: w.shopA.id,
      idempotencyKey: newId(),
    })
    .returning();
  if (!r) throw new Error("no request");
  for (const role of ["staff_other_shop", "owner_other_shop"] as const) {
    const res = await runAsPrincipal(w.principals[role], () =>
      approveRequestAction({ shopId: w.shopB.id, requestId: r.id }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const rej = await runAsPrincipal(w.principals[role], () =>
      rejectRequestAction({ shopId: w.shopB.id, requestId: r.id, reason: "other" }),
    );
    expect(rej).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  }
  const [after] = await db().select().from(pointRequests).where(eq(pointRequests.id, r.id));
  expect(after?.status).toBe("pending");
  expect(await db().select().from(ledgerEntries).where(eq(ledgerEntries.requestId, r.id))).toEqual(
    [],
  );

  // The shop's own staff can: the same request, its own shop id.
  const ok = await runAsPrincipal(w.principals.staff_own_shop, () =>
    approveRequestAction({ shopId: w.shopA.id, requestId: r.id }),
  );
  expect(ok).toMatchObject({ ok: true, data: { outcome: "approved", gold: 100 } });
});

it("[P1-12] decisions take no gold, member, status or approver from the input", async () => {
  const w = await world();
  const base = { shopId: w.shopA.id, requestId: newId() };
  for (const extra of [
    { gold: 500 },
    { awardGold: 500 },
    { membershipId: newId() },
    { userId: newId() },
    { status: "approved" },
    { decidedBy: newId() },
    { amountPence: 0 },
    { amountPence: 12.5 },
    { items: Array.from({ length: 11 }, () => "Tea") },
    { items: ["x".repeat(41)] },
  ]) {
    const res = await runAsPrincipal(w.principals.owner_own_shop, () =>
      approveRequestAction({ ...base, ...extra }),
    );
    expect(res, JSON.stringify(extra)).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
  for (const input of [
    { ...base, reason: "rude" },
    { ...base, reason: "other", note: "x".repeat(201) },
    // Code review M1 (P1-C close): a reversal takes a reason only; free text would land in the audit log.
    { shopId: w.shopA.id, receiptId: newId(), reason: "other", note: "refund for a customer" },
    { shopId: w.shopA.id, receiptId: newId(), reason: "other", points: -10 },
  ]) {
    const res: { ok: boolean } = await runAsPrincipal(
      w.principals.owner_own_shop,
      (): Promise<{ ok: boolean }> =>
        "receiptId" in input ? reverseAwardAction(input) : rejectRequestAction(input),
    );
    expect(res, JSON.stringify(input)).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
});

it("[P2-02] another shop's team can't award shop A's member by scanning their QR in its own shop", async () => {
  const w = await world();
  // The world is shared by this file: shop A's programme may already exist (the P1-12 test above).
  const programmes = await db()
    .select({ id: loyaltyPrograms.id })
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.shopId, w.shopA.id));
  if (programmes.length === 0) await makeProgramme(w.shopA.id);
  const customer = await makeUser();
  const [card, m] = await Promise.all([
    makeCustomerProfile(customer.id),
    makeMembership(customer.id, w.shopA.id),
  ]);
  const token = signMemberQr(card.memberId, Date.now(), memberQrKeys()).token;
  for (const role of ["staff_other_shop", "owner_other_shop"] as const) {
    const res = await runAsPrincipal(w.principals[role], () =>
      scanAwardAction({ shopId: w.shopB.id, member: { token }, idempotencyKey: newId() }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  }
  expect(
    await db().select().from(pointRequests).where(eq(pointRequests.membershipId, m.id)),
  ).toEqual([]);

  // The shop's own staff can, with the same token.
  const ok = await runAsPrincipal(w.principals.staff_own_shop, () =>
    scanAwardAction({ shopId: w.shopA.id, member: { token }, idempotencyKey: newId() }),
  );
  expect(ok).toMatchObject({ ok: true, data: { outcome: "approved", gold: 100 } });
  const [row] = await db().select().from(pointRequests).where(eq(pointRequests.membershipId, m.id));
  expect(row).toMatchObject({ source: "scan", status: "approved" });
});
