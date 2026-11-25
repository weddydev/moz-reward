import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintCustomerScope, mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import {
  auditLogs,
  fraudFlags,
  outbox,
  pointRequests,
  sessions,
  shopStaff,
} from "@/server/db/schema";
import { AWARD_SAME_DEVICE, checkAwardDevice } from "@/server/jobs/fraud-award-check";
import { transaction } from "@/server/repos/_base";
import { approveRequest, ownerApprove } from "@/server/services/approvals";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";

/**
 * P1-12 same-device flag (PRODUCT §5, §16): an award from a team member to a customer account seen on the same
 * device succeeds but raises a fraud flag. The approval writes a `fraud:award-check` outbox row in its own
 * transaction; the job compares the approver's and the customer's live sessions (same IP and user agent) in the
 * identity layer and records a flag holding ids and a count only.
 */

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SHOP_IP = "203.0.113.9";

type SessionOpts = {
  ip?: string | null;
  userAgent?: string | null;
  expiresAt?: Date;
  lastActive?: Date;
};

const DAY = 86_400_000;

async function addSession(userId: string, opts: SessionOpts = {}): Promise<void> {
  await db()
    .insert(sessions)
    .values({
      userId,
      token: `t_${newId()}`,
      ipAddress: opts.ip === undefined ? SHOP_IP : opts.ip,
      userAgent: opts.userAgent === undefined ? IPHONE : opts.userAgent,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + DAY),
      // set_updated_at() runs on UPDATE only, so an insert can place "last active" in the past.
      ...(opts.lastActive ? { createdAt: opts.lastActive, updatedAt: opts.lastActive } : {}),
    });
}

/** A shop, its owner (the approver) and a member. Team rows first: a staff change deletes that user's sessions. */
async function world() {
  const [shop, ownerUser, customerUser] = await Promise.all([
    makeShop({ status: "active" }),
    makeUser(),
    makeUser(),
  ]);
  await Promise.all([makeStaff(shop.id, ownerUser.id, "owner"), makeProgramme(shop.id, 1_000)]);
  const member = await makeMembership(customerUser.id, shop.id);
  const owner = mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" });
  return { shop, member, owner, ownerUser, customerUser };
}

const flagsFor = (receiptId: string) =>
  db()
    .select()
    .from(fraudFlags)
    .where(and(eq(fraudFlags.entity, "receipt"), eq(fraudFlags.entityId, receiptId)));

const flagAudits = (receiptId: string) =>
  db()
    .select({ actorRole: auditLogs.actorRole, meta: auditLogs.meta })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "fraud_flag.raise"), eq(auditLogs.entityId, receiptId)));

const checkRows = (requestId: string) =>
  db()
    .select({ payload: outbox.payload, scopeKind: outbox.scopeKind, shopId: outbox.scopeShopId })
    .from(outbox)
    .where(
      and(
        eq(outbox.queue, "fraud"),
        eq(outbox.jobName, "award-check"),
        sql`${outbox.payload} -> 'data' ->> 'requestId' = ${requestId}`,
      ),
    );

async function pendingRequest(member: { id: string; userId: string; shopId: string }) {
  const [request] = await db()
    .insert(pointRequests)
    .values({
      membershipId: member.id,
      userId: member.userId,
      shopId: member.shopId,
      idempotencyKey: newId(),
      requestedAt: new Date(Date.now() - 60_000),
    })
    .returning({ id: pointRequests.id });
  if (!request) throw new Error("no request");
  return request.id;
}

describe("[P1-12] fraud:award-check outbox", () => {
  it("[P1-12] the approval writes one award-check row (ids only) under the approver's scope", async () => {
    const w = await world();
    const { receiptId, requestId } = await approvedVisit(w.member, { amountPence: 450 });
    expect(await checkRows(requestId)).toEqual([
      {
        payload: { v: 1, data: { receiptId, requestId } },
        scopeKind: "shop",
        shopId: w.shop.id,
      },
    ]);
  });

  it("[P1-12] a rolled-back approval and an award routed to the owner write no check", async () => {
    const w = await world();
    const rolledBack = await pendingRequest(w.member);
    await expect(
      transaction(w.owner, async (tx) => {
        await approveRequest(w.owner, { requestId: rolledBack, amountPence: 450, items: null }, tx);
        throw new Error("crash before commit");
      }),
    ).rejects.toThrow("crash before commit");
    expect(await checkRows(rolledBack)).toEqual([]);

    const staffUser = await makeUser();
    await makeStaff(w.shop.id, staffUser.id, "staff", { perAwardLimit: 1 });
    const staff = mintShopScope({ userId: staffUser.id, shopId: w.shop.id, role: "staff" });
    // The rolled-back request is still open (one open request per membership): a second member.
    const other = await makeMembership((await makeUser()).id, w.shop.id);
    const routed = await pendingRequest(other);
    const result = await transaction(staff, (tx) =>
      approveRequest(staff, { requestId: routed, amountPence: 5_000, items: null }, tx),
    );
    expect(result.outcome).toBe("awaiting_owner");
    expect(await checkRows(routed)).toEqual([]);
  });
});

describe("[P1-12] fraud:award-check job", () => {
  it("[P1-12] flags an award when approver and customer share a live session's IP and user agent", async () => {
    const w = await world();
    await Promise.all([
      addSession(w.ownerUser.id),
      addSession(w.ownerUser.id, { ip: "198.51.100.7", userAgent: WINDOWS }),
      addSession(w.customerUser.id),
    ]);
    const { receiptId, requestId } = await approvedVisit(w.member);

    expect(await checkAwardDevice({ receiptId, requestId }, w.owner)).toEqual({
      receiptId,
      flagged: true,
    });
    const flags = await flagsFor(receiptId);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      rule: AWARD_SAME_DEVICE,
      status: "open",
      details: {
        shopId: w.shop.id,
        requestId,
        membershipId: w.member.id,
        signal: "ip+ua",
        party: "approver",
        matches: 1,
      },
    });
    // Ids and a count only: no IP, user agent or user id leaves the identity layer.
    const details = JSON.stringify(flags[0]?.details);
    for (const secret of [SHOP_IP, "iPhone", w.ownerUser.id, w.customerUser.id]) {
      expect(details).not.toContain(secret);
    }
  });

  it("[P1-12] a retry raises no second flag", async () => {
    const w = await world();
    await Promise.all([addSession(w.ownerUser.id), addSession(w.customerUser.id)]);
    const { receiptId, requestId } = await approvedVisit(w.member);
    await checkAwardDevice({ receiptId, requestId }, w.owner);
    expect(await checkAwardDevice({ receiptId, requestId }, w.owner)).toEqual({
      receiptId,
      flagged: true,
    });
    expect(await flagsFor(receiptId)).toHaveLength(1);
    // One audit row for the one flag, written by the worker (ids only).
    expect(await flagAudits(receiptId)).toEqual([
      {
        actorRole: "system",
        meta: { rule: AWARD_SAME_DEVICE, shopId: w.shop.id, party: "approver" },
      },
    ]);
  });

  it("[P1-12] an expired session still counts while it was active in the last 30 days", async () => {
    const w = await world();
    await Promise.all([
      addSession(w.ownerUser.id),
      addSession(w.customerUser.id, {
        expiresAt: new Date(Date.now() - DAY),
        lastActive: new Date(Date.now() - 20 * DAY),
      }),
    ]);
    const { receiptId, requestId } = await approvedVisit(w.member);
    expect(await checkAwardDevice({ receiptId, requestId }, w.owner)).toEqual({
      receiptId,
      flagged: true,
    });
  });

  it("[P1-12] an award routed to the owner checks the staff member who routed it", async () => {
    const w = await world();
    const staffUser = await makeUser();
    await makeStaff(w.shop.id, staffUser.id, "staff", { perAwardLimit: 1 });
    // The owner signs in elsewhere; the routing staff member shares the customer's phone.
    await Promise.all([
      addSession(w.ownerUser.id, { ip: "198.51.100.7", userAgent: WINDOWS }),
      addSession(staffUser.id),
      addSession(w.customerUser.id),
    ]);
    const staff = mintShopScope({ userId: staffUser.id, shopId: w.shop.id, role: "staff" });
    const requestId = await pendingRequest(w.member);
    const routed = await transaction(staff, (tx) =>
      approveRequest(staff, { requestId, amountPence: 5_000, items: null }, tx),
    );
    expect(routed.outcome).toBe("awaiting_owner");
    const approved = await transaction(w.owner, (tx) => ownerApprove(w.owner, { requestId }, tx));
    if (approved.outcome !== "approved") throw new Error(approved.outcome);

    expect(await checkRows(requestId)).toHaveLength(1);
    expect(await checkAwardDevice({ receiptId: approved.receiptId, requestId }, w.owner)).toEqual({
      receiptId: approved.receiptId,
      flagged: true,
    });
    expect((await flagsFor(approved.receiptId))[0]?.details).toMatchObject({
      party: "router",
      matches: 1,
    });
  });

  it.each<[string, SessionOpts, SessionOpts]>([
    ["a different IP", {}, { ip: "198.51.100.7" }],
    ["a different user agent", {}, { userAgent: WINDOWS }],
    ["a session last active over 30 days ago", {}, { lastActive: new Date(Date.now() - 31 * DAY) }],
    ["no IP recorded on either side", { ip: null }, { ip: null }],
    ["no user agent recorded on either side", { userAgent: null }, { userAgent: null }],
  ])("[P1-12] no flag for %s", async (_label, approverSession, customerSession) => {
    const w = await world();
    await Promise.all([
      addSession(w.ownerUser.id, approverSession),
      addSession(w.customerUser.id, customerSession),
    ]);
    const { receiptId, requestId } = await approvedVisit(w.member);
    expect(await checkAwardDevice({ receiptId, requestId }, w.owner)).toEqual({
      receiptId,
      flagged: false,
    });
    expect(await flagsFor(receiptId)).toEqual([]);
  });

  it("[P1-12] no flag when neither side has a session", async () => {
    const w = await world();
    const { receiptId, requestId } = await approvedVisit(w.member);
    expect(await checkAwardDevice({ receiptId, requestId }, w.owner)).toEqual({
      receiptId,
      flagged: false,
    });
  });

  it("[P1-12] skips a receipt its scope can't see, and any scope that isn't the shop's team", async () => {
    const w = await world();
    await Promise.all([addSession(w.ownerUser.id), addSession(w.customerUser.id)]);
    const { receiptId, requestId } = await approvedVisit(w.member);

    const other = await world();
    expect(await checkAwardDevice({ receiptId, requestId }, other.owner)).toEqual({
      receiptId,
      skipped: "not-visible",
    });
    const customer = mintCustomerScope({ userId: w.customerUser.id });
    expect(await checkAwardDevice({ receiptId, requestId }, customer)).toEqual({
      receiptId,
      skipped: "not-visible",
    });
    // A payload naming another request than the receipt's is refused, not checked.
    expect(await checkAwardDevice({ receiptId, requestId: newId() }, w.owner)).toEqual({
      receiptId,
      skipped: "not-visible",
    });
    expect(await flagsFor(receiptId)).toEqual([]);
  });

  it("[P1-12] the approver removed from the team before the job ran: skipped, no retry", async () => {
    const w = await world();
    const staffUser = await makeUser();
    await makeStaff(w.shop.id, staffUser.id, "staff", { perAwardLimit: 1_000 });
    const staff = mintShopScope({ userId: staffUser.id, shopId: w.shop.id, role: "staff" });
    const requestId = await pendingRequest(w.member);
    const result = await transaction(staff, (tx) =>
      approveRequest(staff, { requestId, amountPence: 450, items: null }, tx),
    );
    if (result.outcome !== "approved") throw new Error(result.outcome);
    await db()
      .update(shopStaff)
      .set({ active: false })
      .where(and(eq(shopStaff.shopId, w.shop.id), eq(shopStaff.userId, staffUser.id)));
    expect(await checkAwardDevice({ receiptId: result.receiptId, requestId }, staff)).toEqual({
      receiptId: result.receiptId,
      skipped: "not-visible",
    });
  });
});
