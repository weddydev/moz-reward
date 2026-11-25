import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as meRoute from "@/app/api/me/receipts/[receiptId]/pdf/route";
import * as shopRoute from "@/app/api/shops/[shopId]/receipts/[receiptId]/pdf/route";
import { newId } from "@/lib/id";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { memberships, outbox, receipts } from "@/server/db/schema";
import { privateStorage } from "@/server/integrations/storage";
import { renderReceiptJob } from "@/server/jobs/receipt-pdf-job";
import { receiptPdfKey } from "@/server/repos/receipts";
import { DOWNLOAD_LIMITS, NOT_READY_RETRY_SEC } from "@/server/services/receipt-download";
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
 * P1-12 receipt PDF downloads (PRODUCT §11, SECURITY §3, §6, §8): the real route handlers, signed in as real
 * principals, against real receipts and the private bucket.
 */

beforeAll(async () => {
  await ensureBucket();
});

async function world() {
  const [shop, otherShop, customerUser, strangerUser, ownerUser, stafferUser, otherOwnerUser] =
    await Promise.all([
      makeShop({ status: "active", name: "Bean There" }),
      makeShop({ status: "active", name: "Elsewhere" }),
      makeUser(),
      makeUser(),
      makeUser(),
      makeUser(),
      makeUser(),
    ]);
  await Promise.all([
    makeStaff(shop.id, ownerUser.id, "owner"),
    makeStaff(shop.id, stafferUser.id, "staff", { perAwardLimit: 200 }),
    makeStaff(otherShop.id, otherOwnerUser.id, "owner"),
    makeProgramme(shop.id, 1_000),
  ]);
  const member = await makeMembership(customerUser.id, shop.id);
  await makeMembership(strangerUser.id, shop.id);
  const { receiptId, receiptNumber } = await approvedVisit(member, {
    amountPence: 450,
    items: ["Latte"],
  });
  const as = (userId: string) =>
    loadPrincipal({ userId, mfaVerified: true, sessionCreatedAt: new Date() });
  return {
    shop,
    otherShop,
    member,
    receiptId,
    receiptNumber,
    owner: mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" }),
    customer: await as(customerUser.id),
    stranger: await as(strangerUser.id),
    staffer: await as(stafferUser.id),
    otherOwner: await as(otherOwnerUser.id),
  };
}

type Principal = Awaited<ReturnType<typeof loadPrincipal>>;

const mine = (who: Principal | null, receiptId: string) =>
  runAsPrincipal(who, () =>
    meRoute.GET(new Request(`http://localhost:3100/api/me/receipts/${receiptId}/pdf`), {
      params: Promise.resolve({ receiptId }),
    }),
  );
const team = (who: Principal | null, shopId: string, receiptId: string) =>
  runAsPrincipal(who, () =>
    shopRoute.GET(
      new Request(`http://localhost:3100/api/shops/${shopId}/receipts/${receiptId}/pdf`),
      { params: Promise.resolve({ shopId, receiptId }) },
    ),
  );

const codeOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

const regenRows = (receiptId: string) =>
  db()
    .select({ scopeKind: outbox.scopeKind, scopeUserId: outbox.scopeUserId })
    .from(outbox)
    .where(
      and(eq(outbox.queue, "pdf"), sql`${outbox.payload} -> 'data' ->> 'receiptId' = ${receiptId}`),
    );

describe("[P1-12] receipt PDF download", () => {
  it("[P1-12] streams the customer's own receipt as a no-store attachment", async () => {
    const w = await world();
    await renderReceiptJob({ receiptId: w.receiptId }, w.owner);
    const res = await mine(w.customer, w.receiptId);
    expect(res.status).toBe(200);
    expect(Object.fromEntries(res.headers)).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="receipt-${String(w.receiptNumber)}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      "content-security-policy": "default-src 'none'; sandbox",
    });
    const body = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get("content-length")).toBe(String(body.length));
    const stored = await privateStorage.get(receiptPdfKey({ id: w.receiptId, shopId: w.shop.id }));
    expect(stored && body.equals(stored.body)).toBe(true);
    expect(meRoute.dynamic).toBe("force-dynamic");
    expect(shopRoute.dynamic).toBe("force-dynamic");
  });

  it("[P1-12] a customer who left the shop still downloads their receipt", async () => {
    const w = await world();
    await renderReceiptJob({ receiptId: w.receiptId }, w.owner);
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.id, w.member.id));
    expect((await mine(w.customer, w.receiptId)).status).toBe(200);
  });

  it("[P1-12] the shop's team downloads it; another shop's team and other customers can't", async () => {
    const w = await world();
    await renderReceiptJob({ receiptId: w.receiptId }, w.owner);
    expect((await team(w.staffer, w.shop.id, w.receiptId)).status).toBe(200);

    // Another member of the same shop: the same 404 as a receipt that doesn't exist.
    const stranger = await mine(w.stranger, w.receiptId);
    expect([stranger.status, await codeOf(stranger)]).toEqual([404, "NOT_FOUND"]);
    // Another shop's owner, through the receipt's shop: not on that team.
    const cross = await team(w.otherOwner, w.shop.id, w.receiptId);
    expect([cross.status, await codeOf(cross)]).toEqual([403, "FORBIDDEN"]);
    // …and through their own shop: the receipt isn't theirs (404, nothing streamed).
    const own = await team(w.otherOwner, w.otherShop.id, w.receiptId);
    expect([own.status, await codeOf(own)]).toEqual([404, "NOT_FOUND"]);
    // Staff reading a receipt through the customer route: only their own memberships count.
    const viaMe = await mine(w.staffer, w.receiptId);
    expect([viaMe.status, await codeOf(viaMe)]).toEqual([404, "NOT_FOUND"]);
  });

  it("[P1-12] signed out → 401; malformed receipt or shop id → the same 404", async () => {
    const w = await world();
    expect((await mine(null, w.receiptId)).status).toBe(401);
    expect((await team(null, w.shop.id, w.receiptId)).status).toBe(401);
    for (const res of [
      await mine(w.customer, "not-a-uuid"),
      await mine(w.customer, `${w.receiptId}/../x`),
      await team(w.staffer, "not-a-shop", w.receiptId),
    ]) {
      expect([res.status, await codeOf(res)]).toEqual([404, "NOT_FOUND"]);
    }
  });

  it("[P1-12] no file yet → 404 NOT_READY with Retry-After, and one regeneration request per 10 minutes", async () => {
    const w = await world();
    expect(await regenRows(w.receiptId)).toHaveLength(1); // the approval's own row
    const first = await mine(w.customer, w.receiptId);
    expect(first.status).toBe(404);
    expect(first.headers.get("retry-after")).toBe(String(NOT_READY_RETRY_SEC));
    expect(await codeOf(first)).toBe("NOT_READY");
    await mine(w.customer, w.receiptId);
    await team(w.staffer, w.shop.id, w.receiptId);
    const rows = await regenRows(w.receiptId);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ scopeKind: "customer", scopeUserId: w.customer.userId });
  });

  it("[P1-12] a stored key that isn't this receipt's own is never followed", async () => {
    const w = await world();
    const other = await approvedVisit(w.member);
    await renderReceiptJob({ receiptId: other.receiptId }, w.owner);
    await db()
      .update(receipts)
      .set({ pdfKey: receiptPdfKey({ id: other.receiptId, shopId: w.shop.id }) })
      .where(eq(receipts.id, w.receiptId));
    const res = await mine(w.customer, w.receiptId);
    expect([res.status, await codeOf(res)]).toEqual([404, "NOT_READY"]);
  });

  it("[P1-12] the per-user limit answers 429 with Retry-After", async () => {
    const w = await world();
    const id = newId();
    for (let i = 0; i < DOWNLOAD_LIMITS.user.max; i++) {
      expect((await mine(w.customer, id)).status).toBe(404);
    }
    const limited = await mine(w.customer, id);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
