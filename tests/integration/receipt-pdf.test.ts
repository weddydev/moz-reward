import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintCustomerScope, mintShopScope, systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { outbox, pointRequests, receipts, shopStaff } from "@/server/db/schema";
import { privateStorage, storage } from "@/server/integrations/storage";
import { renderReceiptJob } from "@/server/jobs/receipt-pdf-job";
import { transaction } from "@/server/repos/_base";
import { receiptPdfKey, recordReceiptPdfKey } from "@/server/repos/receipts";
import { approveRequest } from "@/server/services/approvals";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";
import { ensureBucket } from "../support/storage";

/**
 * P1-12 receipt PDF (PRODUCT §11): the approval writes the `pdf:receipt` outbox row in its own transaction, and
 * the job renders under the producing scope into the private bucket and records the key (moz_worker's one
 * write on receipts).
 */

beforeAll(async () => {
  await ensureBucket();
});

async function world() {
  const [shop, customer] = await Promise.all([
    makeShop({ status: "active", name: "Bean There", addressLine1: "1 High St", town: "Leeds" }),
    makeUser(),
  ]);
  const ownerUser = await makeUser();
  await Promise.all([makeStaff(shop.id, ownerUser.id, "owner"), makeProgramme(shop.id, 1_000)]);
  const member = await makeMembership(customer.id, shop.id);
  const owner = mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" });
  return { shop, member, owner, customer: mintCustomerScope({ userId: customer.id }) };
}

const pdfRows = (receiptId: string) =>
  db()
    .select({ payload: outbox.payload, scopeKind: outbox.scopeKind, shopId: outbox.scopeShopId })
    .from(outbox)
    .where(
      and(
        eq(outbox.queue, "pdf"),
        eq(outbox.jobName, "receipt"),
        sql`${outbox.payload} -> 'data' ->> 'receiptId' = ${receiptId}`,
      ),
    );

const receiptRow = async (id: string) => {
  const [row] = await db().select().from(receipts).where(eq(receipts.id, id));
  if (!row) throw new Error("no receipt");
  return row;
};

describe("[P1-12] receipt PDF outbox", () => {
  it("[P1-12] the approval writes one pdf:receipt row (ids only) under the approver's scope", async () => {
    const w = await world();
    const { receiptId } = await approvedVisit(w.member, { amountPence: 450, items: ["Latte"] });
    const rows = await pdfRows(receiptId);
    expect(rows).toEqual([
      { payload: { v: 1, data: { receiptId } }, scopeKind: "shop", shopId: w.shop.id },
    ]);
  });

  it("[P1-12] a rolled-back approval leaves no receipt and no pdf row", async () => {
    const w = await world();
    const [request] = await db()
      .insert(pointRequests)
      .values({
        membershipId: w.member.id,
        userId: w.member.userId,
        shopId: w.shop.id,
        idempotencyKey: newId(),
        requestedAt: new Date(Date.now() - 60_000),
      })
      .returning({ id: pointRequests.id });
    if (!request) throw new Error("no request");
    let receiptId = "";
    await expect(
      transaction(w.owner, async (tx) => {
        const result = await approveRequest(
          w.owner,
          { requestId: request.id, amountPence: 450, items: null },
          tx,
        );
        if (result.outcome === "approved") receiptId = result.receiptId;
        throw new Error("crash before commit");
      }),
    ).rejects.toThrow("crash before commit");
    expect(receiptId).not.toBe("");
    expect(await pdfRows(receiptId)).toEqual([]);
    expect(await db().select().from(receipts).where(eq(receipts.id, receiptId))).toEqual([]);
  });
});

describe("[P1-12] pdf:receipt job", () => {
  it("[P1-12] renders into the private bucket only, records the key, and a re-run gives the same bytes", async () => {
    const w = await world();
    const { receiptId } = await approvedVisit(w.member, { amountPence: 450, items: ["Latte"] });
    const key = receiptPdfKey({ id: receiptId, shopId: w.shop.id });

    const first = await renderReceiptJob({ receiptId }, w.owner);
    expect(first).toMatchObject({ receiptId, bytes: expect.any(Number) as number });
    expect((await receiptRow(receiptId)).pdfKey).toBe(key);
    const stored = await privateStorage.get(key);
    expect(stored?.contentType).toBe("application/pdf");
    expect(stored?.body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(await storage.get(key)).toBeNull();

    await renderReceiptJob({ receiptId }, w.owner);
    expect((await privateStorage.get(key))?.body.equals(stored?.body ?? Buffer.alloc(0))).toBe(
      true,
    );
    expect((await receiptRow(receiptId)).pdfKey).toBe(key);
  });

  it("[P1-12] renders for the customer who owns the receipt (a download's regeneration)", async () => {
    const w = await world();
    const { receiptId } = await approvedVisit(w.member);
    expect(await renderReceiptJob({ receiptId }, w.customer)).toMatchObject({ receiptId });
    expect((await receiptRow(receiptId)).pdfKey).not.toBeNull();
  });

  it("[P1-12] renders nothing for another shop's team, another customer or a removed approver", async () => {
    const w = await world();
    const other = await world();
    const { receiptId } = await approvedVisit(w.member);
    const notVisible = { receiptId, skipped: "not-visible" };

    expect(await renderReceiptJob({ receiptId }, other.owner)).toEqual(notVisible);
    expect(await renderReceiptJob({ receiptId }, other.customer)).toEqual(notVisible);
    // A team member deactivated after approving: RLS no longer shows them the shop's receipts.
    await db()
      .update(shopStaff)
      .set({ active: false })
      .where(and(eq(shopStaff.shopId, w.shop.id), eq(shopStaff.userId, w.owner.userId)));
    expect(await renderReceiptJob({ receiptId }, w.owner)).toEqual(notVisible);

    expect((await receiptRow(receiptId)).pdfKey).toBeNull();
    expect(
      await privateStorage.get(receiptPdfKey({ id: receiptId, shopId: w.shop.id })),
    ).toBeNull();
  });

  it("[P1-12] a malformed snapshot ends the job without a file or a retry", async () => {
    const w = await world();
    const { receiptId } = await approvedVisit(w.member);
    await db()
      .update(receipts)
      .set({ data: sql`jsonb_set(${receipts.data}, '{goldEarned}', '"lots"')` })
      .where(eq(receipts.id, receiptId));
    expect(await renderReceiptJob({ receiptId }, w.owner)).toEqual({
      receiptId,
      skipped: "malformed",
    });
    expect((await receiptRow(receiptId)).pdfKey).toBeNull();
  });

  it("[P1-12] the key write touches only that receipt of that shop, and never replaces another key", async () => {
    const w = await world();
    const { receiptId } = await approvedVisit(w.member);
    const worker = systemScope("test: record a receipt pdf key");
    const key = receiptPdfKey({ id: receiptId, shopId: w.shop.id });

    expect(await recordReceiptPdfKey(worker, { id: receiptId, shopId: newId() }, key)).toBe(false);
    expect(await recordReceiptPdfKey(worker, { id: receiptId, shopId: w.shop.id }, key)).toBe(true);
    expect(await recordReceiptPdfKey(worker, { id: receiptId, shopId: w.shop.id }, key)).toBe(true);
    expect(
      await recordReceiptPdfKey(worker, { id: receiptId, shopId: w.shop.id }, `${key}.other`),
    ).toBe(false);
    expect((await receiptRow(receiptId)).pdfKey).toBe(key);
  });
});
