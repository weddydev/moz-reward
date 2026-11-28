import { asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { MemberId } from "@/lib/brand";
import { formatMemberId } from "@/lib/codes";
import { newId } from "@/lib/id";
import { mintCustomerScope, mintShopScope, type Scope, type ShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { ledgerEntries, memberships, pointRequests, receipts } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { transaction, withScope } from "@/server/repos/_base";
import { memberQrKeys, signMemberQr } from "@/server/security/member-qr";
import { SELF_AWARD } from "@/server/services/approvals";
import {
  NOT_A_MEMBER,
  QR_EXPIRED,
  QR_INVALID,
  scanAward,
  type ScanAwardInput,
} from "@/server/services/scan-awards";
import {
  makeCustomerProfile,
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";

/**
 * P2-02 member-QR scan awards (PRODUCT §5 "Member QR scan"): staff scan a customer's member QR (or type the
 * member ID from an offline card) and award directly. The award is a `source = 'scan'` request decided in the same
 * transaction through the P1-12 approve path, so every award guard applies. The token is verified again here
 * with the current-membership check (P1-14 design check M5): the scanner's verify result is never trusted.
 */

async function world() {
  const [shop, otherShop, ownerUser, stafferUser, otherStafferUser, ana, ben] = await Promise.all([
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
    makeUser(),
    makeUser(),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  await Promise.all([
    makeStaff(shop.id, ownerUser.id, "owner"),
    makeStaff(shop.id, stafferUser.id, "staff", { perAwardLimit: 200 }),
    makeStaff(otherShop.id, otherStafferUser.id, "staff"),
    makeProgramme(shop.id, 1_000, { earnMode: "per_pound", earnRate: 10 }),
    makeProgramme(otherShop.id, 1_000, { earnMode: "per_pound", earnRate: 10 }),
  ]);
  const [anaCard, benCard, stafferCard] = await Promise.all([
    makeCustomerProfile(ana.id, { fullName: "Ana Pereira" }),
    makeCustomerProfile(ben.id, { fullName: "Ben Okafor" }),
    makeCustomerProfile(stafferUser.id, { fullName: "Sam Lee" }),
  ]);
  const [anaMember, , stafferMember] = await Promise.all([
    makeMembership(ana.id, shop.id),
    makeMembership(ben.id, otherShop.id),
    makeMembership(stafferUser.id, shop.id),
  ]);
  return {
    shop,
    otherShop,
    anaMember,
    stafferMember,
    anaId: anaCard.memberId,
    benId: benCard.memberId,
    stafferId: stafferCard.memberId,
    anaScope: mintCustomerScope({ userId: ana.id }),
    owner: mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" }),
    staff: mintShopScope({ userId: stafferUser.id, shopId: shop.id, role: "staff" }),
    otherStaff: mintShopScope({ userId: otherStafferUser.id, shopId: otherShop.id, role: "staff" }),
  };
}

type World = Awaited<ReturnType<typeof world>>;
let w: World;
beforeEach(async () => {
  w = await world();
});

const token = (memberId: MemberId, now = Date.now()) =>
  signMemberQr(memberId, now, memberQrKeys()).token;

const scan = (scope: ShopScope, input: Partial<ScanAwardInput> & Pick<ScanAwardInput, "member">) =>
  transaction(scope, (tx) =>
    scanAward(scope, { idempotencyKey: newId(), amountPence: 1_000, ...input }, tx),
  );

async function failure(run: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await run();
  } catch (err) {
    if (err instanceof AppError) return { code: err.code, message: err.message };
    throw err;
  }
  throw new Error("expected a failure");
}

const requestsOf = (membershipId: string) =>
  db()
    .select()
    .from(pointRequests)
    .where(eq(pointRequests.membershipId, membershipId))
    .orderBy(asc(pointRequests.requestedAt));

describe("[P2-02] scan awards", () => {
  it("[P2-02] a scanned member QR awards directly: an approved `scan` request with its ledger row and receipt", async () => {
    const result = await scan(w.staff, {
      member: { token: token(w.anaId) },
      items: ["Flat white"],
    });
    expect(result).toMatchObject({ outcome: "approved", gold: 100 });
    const [row] = await requestsOf(w.anaMember.id);
    expect(row).toMatchObject({
      source: "scan",
      status: "approved",
      decidedBy: w.staff.userId,
      amountPence: 1_000,
      items: ["Flat white"],
      awardGold: 100,
      clientRequestedAt: null,
    });
    const ledger = await db()
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.membershipId, w.anaMember.id));
    expect(ledger).toMatchObject([{ type: "earn", points: 100, requestId: row?.id }]);
    if (result.outcome !== "approved") throw new Error("not approved");
    const [receipt] = await db().select().from(receipts).where(eq(receipts.id, result.receiptId));
    expect(receipt).toBeDefined();
  });

  it("[P2-02] a typed member ID (offline card) awards the same way, in either format", async () => {
    for (const typed of [formatMemberId(w.anaId), w.anaId.toLowerCase()]) {
      const result = await scan(w.owner, { member: { memberId: typed } });
      expect(result.outcome).toBe("approved");
    }
    const rows = await requestsOf(w.anaMember.id);
    expect(rows.map((r) => [r.source, r.status])).toEqual([
      ["scan", "approved"],
      ["scan", "approved"],
    ]);
  });

  it("[P2-02] a forged or malformed token → a clear error, and nothing is written", async () => {
    const real = token(w.anaId);
    const forged = real.slice(0, -2) + (real.endsWith("AA") ? "BB" : "AA");
    for (const t of [forged, "not-a-token", "https://evil.example/qr"]) {
      expect(await failure(() => scan(w.staff, { member: { token: t } }))).toEqual({
        code: "VALIDATION",
        message: QR_INVALID,
      });
    }
    expect(await requestsOf(w.anaMember.id)).toEqual([]);
  });

  it("[P2-02] an expired token → asks for a fresh card, and nothing is written", async () => {
    const old = token(w.anaId, Date.now() - 6 * 60_000);
    expect(await failure(() => scan(w.staff, { member: { token: old } }))).toEqual({
      code: "VALIDATION",
      message: QR_EXPIRED,
    });
    expect(await requestsOf(w.anaMember.id)).toEqual([]);
  });

  it("[P2-02] another shop's member, an unknown ID and a former member all get the same answer (nothing revealed)", async () => {
    const answers = [
      await failure(() => scan(w.staff, { member: { token: token(w.benId) } })),
      await failure(() => scan(w.staff, { member: { memberId: w.benId } })),
      await failure(() => scan(w.staff, { member: { memberId: "ZZZ-ZZZ" } })),
    ];
    // The token was good when shown; Ana left before the award (M5: re-verified at award).
    const shown = token(w.anaId);
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.id, w.anaMember.id));
    answers.push(await failure(() => scan(w.staff, { member: { token: shown } })));
    for (const a of answers) expect(a).toEqual({ code: "NOT_FOUND", message: NOT_A_MEMBER });
    expect(await requestsOf(w.anaMember.id)).toEqual([]);
  });

  it("[P2-02] a staff member scanning their own member QR is refused", async () => {
    expect(await failure(() => scan(w.staff, { member: { token: token(w.stafferId) } }))).toEqual({
      code: "FORBIDDEN",
      message: SELF_AWARD,
    });
    expect(await requestsOf(w.stafferMember.id)).toEqual([]);
  });

  it("[P2-02] above the staff member's per-award limit → waits for the owner as a `scan`, never awarded", async () => {
    // £25 = 250 gold > 200.
    const result = await scan(w.staff, { member: { token: token(w.anaId) }, amountPence: 2_500 });
    expect(result).toMatchObject({ outcome: "awaiting_owner", gold: 250 });
    const [row] = await requestsOf(w.anaMember.id);
    expect(row).toMatchObject({
      source: "scan",
      status: "awaiting_owner",
      routedBy: w.staff.userId,
    });
    const ledger = await db()
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.membershipId, w.anaMember.id));
    expect(ledger).toEqual([]);
  });

  it("[P2-02] the same scan sent twice (double tap, retry) records one award", async () => {
    const key = newId();
    const first = await scan(w.staff, { member: { token: token(w.anaId) }, idempotencyKey: key });
    const again = await scan(w.staff, { member: { token: token(w.anaId) }, idempotencyKey: key });
    expect(first.outcome).toBe("approved");
    expect(again).toEqual({ outcome: "already_recorded", requestId: first.requestId });
    expect(await requestsOf(w.anaMember.id)).toHaveLength(1);

    const key2 = newId();
    const both = await Promise.allSettled([
      scan(w.owner, { member: { token: token(w.anaId) }, idempotencyKey: key2 }),
      scan(w.owner, { member: { token: token(w.anaId) }, idempotencyKey: key2 }),
    ]);
    expect(both.every((b) => b.status === "fulfilled")).toBe(true);
    expect(await requestsOf(w.anaMember.id)).toHaveLength(2);
  });

  it("[P2-02] a member with a request already waiting → that request is handed back to approve, no second one", async () => {
    const [open] = await db()
      .insert(pointRequests)
      .values({
        membershipId: w.anaMember.id,
        userId: w.anaMember.userId,
        shopId: w.shop.id,
        idempotencyKey: newId(),
      })
      .returning();
    const result = await scan(w.staff, { member: { token: token(w.anaId) } });
    expect(result).toEqual({ outcome: "open_request", requestId: open?.id });
    expect(await requestsOf(w.anaMember.id)).toHaveLength(1);
  });

  it("[P2-02] another shop's staff scanning this shop's member learn nothing and award nothing", async () => {
    expect(await failure(() => scan(w.otherStaff, { member: { token: token(w.anaId) } }))).toEqual({
      code: "NOT_FOUND",
      message: NOT_A_MEMBER,
    });
    expect(await requestsOf(w.anaMember.id)).toEqual([]);
  });
});

describe("[P2-02] scan awards: database walls (0038)", () => {
  const DENIED = "42501";
  async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
    try {
      await run();
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      return e.cause?.code ?? e.code;
    }
    return undefined;
  }
  const insert = (
    scope: Scope,
    m: { id: string; userId: string; shopId: string },
    source: "scan" | "request",
  ) =>
    withScope(scope, (q) =>
      q.execute(sql`INSERT INTO point_requests (id, membership_id, user_id, shop_id, idempotency_key, source)
        VALUES (${newId()}, ${m.id}, ${m.userId}, ${m.shopId}, ${newId()}, ${source}::point_request_source)`),
    );

  it("[P2-02] a customer can't insert a scan; the team can't insert a plain request", async () => {
    expect(await pgCode(() => insert(w.anaScope, w.anaMember, "scan"))).toBe(DENIED);
    expect(await pgCode(() => insert(w.staff, w.anaMember, "request"))).toBe(DENIED);
  });

  it("[P2-02] the team can't insert a scan for themselves, for another shop, or for a former member", async () => {
    expect(await pgCode(() => insert(w.staff, w.stafferMember, "scan"))).toBe(DENIED);
    expect(await pgCode(() => insert(w.otherStaff, w.anaMember, "scan"))).toBe(DENIED);
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.id, w.anaMember.id));
    expect(await pgCode(() => insert(w.staff, w.anaMember, "scan"))).toBe(DENIED);
  });

  it("[P2-02] the team's scan for a current member of its own shop is accepted (pending until decided)", async () => {
    expect(await pgCode(() => insert(w.staff, w.anaMember, "scan"))).toBeUndefined();
  });
});
