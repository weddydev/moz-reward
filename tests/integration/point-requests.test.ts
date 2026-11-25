import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintCustomerScope, mintShopScope, systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { memberships, notifications, outbox, pointRequests } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { transaction, withScope } from "@/server/repos/_base";
import { readOwnOpenRequest } from "@/server/repos/point-requests";
import { leaveShop } from "@/server/services/membership";
import {
  expirePointRequests,
  REMIND_AFTER_MS,
  remindPointRequests,
  REQUEST_TTL_MS,
} from "@/server/services/point-request-jobs";
import {
  DAILY_CAP_MESSAGE,
  NO_PROGRAMME_YET,
  NOT_TAKING_REQUESTS,
  requestPoints,
} from "@/server/services/point-requests";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
  setShopStatus,
} from "@/server/testing/factories";

/**
 * P1-11 (PRODUCT §5, §19; SECURITY §6; ENGINEERING §7): points requests. One request per tap (idempotency key),
 * one open request per membership (pending or awaiting_owner), 5 per UK day, `requested_at` = the server's
 * receipt time; jobs expire open requests after 24 h (customer told once) and remind the shop once after 30 min.
 * C-68: leaving cancels open requests in the leave transaction; a left member can't request.
 */

const JOBS = systemScope("P1-11 tests: request jobs");

type Shop = Awaited<ReturnType<typeof makeShop>>;

async function shopWithProgramme(status: Shop["status"] = "active"): Promise<Shop> {
  const shop = await makeShop({ status });
  await makeProgramme(shop.id);
  return shop;
}

async function member(shop: Shop) {
  const user = await makeUser();
  const m = await makeMembership(user.id, shop.id);
  return { id: user.id, membershipId: m.id, scope: mintCustomerScope({ userId: user.id }) };
}
type Member = Awaited<ReturnType<typeof member>>;

const ask = (
  c: Member,
  shopId: string,
  key: string = newId(),
  extra: { clientRequestedAt?: Date; now?: Date } = {},
) =>
  transaction(c.scope, (tx) =>
    requestPoints(
      c.scope,
      { shopId, idempotencyKey: key, clientRequestedAt: extra.clientRequestedAt ?? null },
      tx,
      extra.now,
    ),
  );

const errorOf = async (run: () => Promise<unknown>): Promise<AppError | undefined> => {
  try {
    await run();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  return undefined;
};

const requestsOf = (userId: string) =>
  db().select().from(pointRequests).where(eq(pointRequests.userId, userId));

const setRequest = (id: string, values: Partial<typeof pointRequests.$inferInsert>) =>
  db().update(pointRequests).set(values).where(eq(pointRequests.id, id));

/** A past request written the way the worker/owner can (the web role's guard stamps now()). */
const pastRequest = (c: Member, shopId: string, over: Partial<typeof pointRequests.$inferInsert>) =>
  db()
    .insert(pointRequests)
    .values({
      membershipId: c.membershipId,
      userId: c.id,
      shopId,
      idempotencyKey: newId(),
      // P1-12: a rejected request always carries its preset reason (CHECK point_requests_rejected_has_reason).
      ...(over.status === "rejected" ? { rejectReason: "other" as const } : {}),
      ...over,
    })
    .returning()
    .then((rows) => {
      const row = rows[0];
      if (!row) throw new Error("no row");
      return row;
    });

const publishedFor = async (requestId: string) =>
  (
    await db()
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(
        and(
          eq(outbox.queue, "notifications"),
          inArray(outbox.jobName, ["publish", "publish-system"]),
        ),
      )
  )
    .map(
      (r) =>
        r.payload as {
          data: { targets: unknown[]; event: { type: string; data: Record<string, unknown> } };
        },
    )
    .filter((p) => p.data.event.data.requestId === requestId)
    .map((p) => ({ type: p.data.event.type, data: p.data.event.data, targets: p.data.targets }));

const noticesOf = (userId: string, type: string) =>
  db()
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));

describe("[P1-11] request points", () => {
  it("creates a pending request stamped with the server's receipt time and hints the shop and the member", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const before = Date.now();
    const res = await ask(c, shop.id);
    expect(res).toMatchObject({ status: "pending", outcome: "created" });
    const [row] = await requestsOf(c.id);
    expect(row).toMatchObject({
      id: res.requestId,
      status: "pending",
      membershipId: c.membershipId,
      shopId: shop.id,
      decidedAt: null,
    });
    expect(row?.requestedAt.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(row?.requestedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
    expect(await publishedFor(res.requestId)).toEqual([
      {
        type: "request_created",
        data: { requestId: res.requestId, shopId: shop.id },
        targets: [
          { kind: "shop", id: shop.id },
          { kind: "user", id: c.id },
        ],
      },
    ]);
  });

  it("double tap: parallel calls with the same key make one request and both get it", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const key = newId();
    const results = await Promise.all([
      ask(c, shop.id, key),
      ask(c, shop.id, key),
      ask(c, shop.id, key),
    ]);
    const rows = await requestsOf(c.id);
    expect(rows).toHaveLength(1);
    expect(new Set(results.map((r) => r.requestId))).toEqual(new Set([rows[0]?.id]));
    expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(2);
  });

  it("two devices at once (different keys): one open request; the other device gets that one", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const results = await Promise.all(Array.from({ length: 4 }, () => ask(c, shop.id)));
    const rows = await requestsOf(c.id);
    expect(rows).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "open")).toHaveLength(3);
    expect(new Set(results.map((r) => r.requestId))).toEqual(new Set([rows[0]?.id]));
  });

  it("an open awaiting_owner request blocks a new one", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const first = await ask(c, shop.id);
    await setRequest(first.requestId, { status: "awaiting_owner" });
    const second = await ask(c, shop.id);
    expect(second).toMatchObject({
      requestId: first.requestId,
      outcome: "open",
      status: "awaiting_owner",
    });
    expect(await requestsOf(c.id)).toHaveLength(1);
  });

  it("the database allows one open request per membership whoever writes (partial unique index)", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    await pastRequest(c, shop.id, { status: "pending" });
    await expect(pastRequest(c, shop.id, { status: "awaiting_owner" })).rejects.toThrow();
    // Closed ones don't count.
    await pastRequest(c, shop.id, { status: "rejected", decidedAt: new Date() });
  });

  it("the 6th request in a UK day gets the friendly limit; yesterday's don't count", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    // 16:00 UK time on a summer day (BST): the UK day began at 23:00 UTC the evening before.
    const now = new Date("2026-07-15T15:00:00Z");
    const decided = { status: "rejected" as const, decidedAt: now };
    await pastRequest(c, shop.id, { ...decided, requestedAt: new Date("2026-07-14T22:59:00Z") }); // 23:59 the day before
    for (const at of ["23:00", "23:30"])
      await pastRequest(c, shop.id, { ...decided, requestedAt: new Date(`2026-07-14T${at}:00Z`) });
    for (const at of ["09:00", "10:00"])
      await pastRequest(c, shop.id, { ...decided, requestedAt: new Date(`2026-07-15T${at}:00Z`) });
    // 4 today: the 5th is allowed.
    const fifth = await ask(c, shop.id, newId(), { now });
    expect(fifth.outcome).toBe("created");
    await setRequest(fifth.requestId, { status: "approved", decidedAt: new Date() });
    // The stamp is the real server time, so the 5th sits in the real today; the cap counts the injected day.
    await db()
      .update(pointRequests)
      .set({ requestedAt: new Date("2026-07-15T14:00:00Z") })
      .where(eq(pointRequests.id, fifth.requestId));
    const sixth = await errorOf(() => ask(c, shop.id, newId(), { now }));
    expect(sixth).toMatchObject({ code: "LIMIT_REACHED", message: DAILY_CAP_MESSAGE });
    // The next UK day starts at 00:00 BST.
    const tomorrow = await ask(c, shop.id, newId(), { now: new Date("2026-07-15T23:01:00Z") });
    expect(tomorrow.outcome).toBe("created");
  });

  it("a retried key returns its request even past the daily cap (offline queue retry)", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const key = newId();
    const first = await ask(c, shop.id, key);
    for (let i = 0; i < 5; i++)
      await pastRequest(c, shop.id, { status: "rejected", decidedAt: new Date() });
    expect(await ask(c, shop.id, key)).toMatchObject({
      requestId: first.requestId,
      outcome: "duplicate",
    });
  });

  it("queued offline at 16:55 and received at 17:10: requested_at is the receipt time; the client time is advisory", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const queuedAt = new Date(Date.now() - 15 * 60_000);
    const res = await ask(c, shop.id, newId(), { clientRequestedAt: queuedAt });
    const [row] = await requestsOf(c.id);
    expect(row?.clientRequestedAt?.toISOString()).toBe(queuedAt.toISOString());
    expect(row?.requestedAt.getTime()).toBeGreaterThan(queuedAt.getTime() + 14 * 60_000);
    expect(res.requestedAt).toBe(row?.requestedAt.toISOString());
  });

  it("a phone clock set a day ahead is ignored (stored as advisory, never the stamp)", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const ahead = new Date(Date.now() + 24 * 60 * 60_000);
    await ask(c, shop.id, newId(), { clientRequestedAt: ahead });
    const [row] = await requestsOf(c.id);
    expect(row?.clientRequestedAt?.toISOString()).toBe(ahead.toISOString());
    expect(Math.abs((row?.requestedAt.getTime() ?? 0) - Date.now())).toBeLessThan(5_000);
  });

  it("a shop with no loyalty programme yet refuses with a friendly message", async () => {
    const shop = await makeShop({ status: "active" });
    const c = await member(shop);
    expect(await errorOf(() => ask(c, shop.id))).toMatchObject({
      code: "FORBIDDEN",
      message: NO_PROGRAMME_YET,
    });
    expect(await requestsOf(c.id)).toEqual([]);
  });

  it("shop states (PRODUCT §15): expiring, grace and restricted take requests; suspended and closed don't", async () => {
    for (const status of ["expiring", "grace", "restricted"] as const) {
      const shop = await shopWithProgramme(status);
      const c = await member(shop);
      expect((await ask(c, shop.id)).outcome).toBe("created");
    }
    for (const status of ["suspended", "closed"] as const) {
      const shop = await shopWithProgramme("active");
      const c = await member(shop);
      await setShopStatus(shop.id, status);
      expect(await errorOf(() => ask(c, shop.id))).toMatchObject({
        code: "FORBIDDEN",
        message: NOT_TAKING_REQUESTS,
      });
      expect(await requestsOf(c.id)).toEqual([]);
    }
  });

  it("a non-member and a left member can't request (NOT_FOUND)", async () => {
    const shop = await shopWithProgramme();
    const stranger = await makeUser();
    const scope = mintCustomerScope({ userId: stranger.id });
    expect(
      await errorOf(() =>
        transaction(scope, (tx) =>
          requestPoints(scope, { shopId: shop.id, idempotencyKey: newId() }, tx),
        ),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const c = await member(shop);
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.id, c.membershipId));
    expect(await errorOf(() => ask(c, shop.id))).toMatchObject({ code: "NOT_FOUND" });
    expect(await requestsOf(c.id)).toEqual([]);
  });

  it("a key already used at another shop, or by another account, is a conflict and reveals nothing", async () => {
    const shopA = await shopWithProgramme();
    const shopB = await shopWithProgramme();
    const c = await member(shopA);
    const user = await makeUser();
    await makeMembership(user.id, shopB.id);
    const cB = { id: user.id, membershipId: "", scope: mintCustomerScope({ userId: user.id }) };
    const key = newId();
    await ask(c, shopA.id, key);
    expect(await errorOf(() => ask(cB, shopB.id, key))).toMatchObject({ code: "CONFLICT" });
    await makeMembership(c.id, shopB.id);
    expect(await errorOf(() => ask(c, shopB.id, key))).toMatchObject({ code: "CONFLICT" });
  });
});

describe("[P1-11] C-68: leaving cancels open requests", () => {
  it("cancels pending and awaiting_owner requests in the leave transaction and hints the shop's queue", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const res = await ask(c, shop.id);
    await setRequest(res.requestId, { status: "awaiting_owner" });
    await transaction(c.scope, (tx) => leaveShop(c.scope, shop.id, tx));
    const [row] = await requestsOf(c.id);
    expect(row).toMatchObject({ status: "cancelled" });
    expect(row?.decidedAt).toBeInstanceOf(Date);
    expect(await publishedFor(res.requestId)).toContainEqual({
      type: "request_decided",
      data: { requestId: res.requestId, shopId: shop.id, outcome: "cancelled" },
      targets: [
        { kind: "shop", id: shop.id },
        { kind: "user", id: c.id },
      ],
    });
    // Left: no new request.
    expect(await errorOf(() => ask(c, shop.id))).toMatchObject({ code: "NOT_FOUND" });
  });

  it("a rolled-back leave cancels nothing", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const res = await ask(c, shop.id);
    await expect(
      transaction(c.scope, async (tx) => {
        await leaveShop(c.scope, shop.id, tx);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect((await requestsOf(c.id))[0]).toMatchObject({ id: res.requestId, status: "pending" });
  });

  it("a leave and a request at the same moment never leave an open request on a left membership", async () => {
    for (let round = 0; round < 5; round++) {
      const shop = await shopWithProgramme();
      const c = await member(shop);
      await Promise.allSettled([
        ask(c, shop.id),
        transaction(c.scope, (tx) => leaveShop(c.scope, shop.id, tx)),
      ]);
      const open = (await requestsOf(c.id)).filter((r) => r.status === "pending");
      expect(open).toEqual([]);
    }
  });

  it("the shop page reads the member's open request only", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    expect(await readOwnOpenRequest(c.scope, shop.id)).toBeNull();
    const res = await ask(c, shop.id);
    expect(await readOwnOpenRequest(c.scope, shop.id)).toMatchObject({
      id: res.requestId,
      status: "pending",
    });
    const other = await member(shop);
    expect(await readOwnOpenRequest(other.scope, shop.id)).toBeNull();
  });
});

describe("[P1-11] database walls (RLS + guard)", () => {
  it("the web role can't choose requested_at, the status, or another member's membership", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const victim = await member(shop);
    const insert = (values: Partial<typeof pointRequests.$inferInsert>) =>
      transaction(c.scope, (tx) =>
        withScope(
          c.scope,
          (q) =>
            q.insert(pointRequests).values({
              membershipId: c.membershipId,
              userId: c.id,
              shopId: shop.id,
              idempotencyKey: newId(),
              ...values,
            }),
          tx,
        ),
      );
    await expect(insert({ requestedAt: new Date(Date.now() - 60 * 60_000) })).rejects.toThrow();
    await expect(insert({ status: "approved", decidedAt: new Date() })).rejects.toThrow();
    await expect(
      insert({ membershipId: victim.membershipId, userId: victim.id }),
    ).rejects.toThrow();
    await expect(insert({ membershipId: victim.membershipId })).rejects.toThrow();
    expect(await requestsOf(c.id)).toEqual([]);
  });

  it("the member may only cancel an open request: approving their own is refused", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const res = await ask(c, shop.id);
    const update = (values: Partial<typeof pointRequests.$inferInsert>) =>
      transaction(c.scope, (tx) =>
        withScope(
          c.scope,
          (q) => q.update(pointRequests).set(values).where(eq(pointRequests.id, res.requestId)),
          tx,
        ),
      );
    await expect(
      update({ status: "approved", decidedAt: sql`now()` as unknown as Date }),
    ).rejects.toThrow();
    await expect(update({ requestedAt: new Date(0) })).rejects.toThrow();
    expect((await requestsOf(c.id))[0]).toMatchObject({ status: "pending" });
  });

  it("a shop's team reads its own shop's requests, never another shop's", async () => {
    const shopA = await shopWithProgramme();
    const shopB = await shopWithProgramme();
    const c = await member(shopA);
    const res = await ask(c, shopA.id);
    const staffA = await makeUser();
    await makeStaff(shopA.id, staffA.id);
    const staffB = await makeUser();
    await makeStaff(shopB.id, staffB.id);
    const read = (userId: string, shopId: string) => {
      const scope = mintShopScope({ userId, shopId, role: "staff" });
      return withScope(scope, (q) =>
        q
          .select({ id: pointRequests.id })
          .from(pointRequests)
          .where(eq(pointRequests.id, res.requestId)),
      );
    };
    expect(await read(staffA.id, shopA.id)).toEqual([{ id: res.requestId }]);
    expect(await read(staffB.id, shopB.id)).toEqual([]);
    // Another customer sees none of it.
    const other = await member(shopA);
    expect(
      await withScope(other.scope, (q) =>
        q
          .select({ id: pointRequests.id })
          .from(pointRequests)
          .where(eq(pointRequests.id, res.requestId)),
      ),
    ).toEqual([]);
  });
});

describe("[P1-11] jobs: expiry and the shop's reminder (injected clock)", () => {
  it("expires a pending request exactly at 24 h, tells the customer once, and hints the shop", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const requestedAt = new Date(Date.now() - REQUEST_TTL_MS - 60_000);
    const req = await pastRequest(c, shop.id, { requestedAt });

    await expirePointRequests(JOBS, new Date(requestedAt.getTime() + REQUEST_TTL_MS - 1_000));
    expect((await requestsOf(c.id))[0]?.status).toBe("pending");

    const at24h = new Date(requestedAt.getTime() + REQUEST_TTL_MS);
    expect((await expirePointRequests(JOBS, at24h)).expired).toBeGreaterThanOrEqual(1);
    expect((await requestsOf(c.id))[0]).toMatchObject({ status: "expired" });
    await expirePointRequests(JOBS, at24h);
    await expirePointRequests(JOBS, new Date(at24h.getTime() + 10 * 60_000));

    const notices = await noticesOf(c.id, "request_expired");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      shopId: shop.id,
      category: "transactional",
      payload: { shopId: shop.id, requestId: req.id, requestedAt: requestedAt.toISOString() },
    });
    expect(await publishedFor(req.id)).toContainEqual({
      type: "request_decided",
      data: { requestId: req.id, shopId: shop.id, outcome: "expired" },
      targets: [
        { kind: "shop", id: shop.id },
        { kind: "user", id: c.id },
      ],
    });
  });

  it("awaiting_owner expires on the original 24 h", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const requestedAt = new Date(Date.now() - REQUEST_TTL_MS - 60_000);
    const req = await pastRequest(c, shop.id, { requestedAt, status: "awaiting_owner" });
    await expirePointRequests(JOBS, new Date(requestedAt.getTime() + REQUEST_TTL_MS));
    expect((await requestsOf(c.id))[0]).toMatchObject({ id: req.id, status: "expired" });
    expect(await noticesOf(c.id, "request_expired")).toHaveLength(1);
  });

  it("decided requests are never expired", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const requestedAt = new Date(Date.now() - 2 * REQUEST_TTL_MS);
    await pastRequest(c, shop.id, { requestedAt, status: "approved", decidedAt: new Date() });
    await expirePointRequests(JOBS);
    expect((await requestsOf(c.id))[0]?.status).toBe("approved");
    expect(await noticesOf(c.id, "request_expired")).toEqual([]);
  });

  it("reminds the shop's active team once after 30 min pending; not before, not awaiting_owner", async () => {
    const shop = await shopWithProgramme();
    const c = await member(shop);
    const owner = await makeUser();
    await makeStaff(shop.id, owner.id, "owner");
    const staff = await makeUser();
    await makeStaff(shop.id, staff.id);
    const gone = await makeUser();
    await makeStaff(shop.id, gone.id, "staff", { active: false });
    const requestedAt = new Date(Date.now() - REMIND_AFTER_MS - 60_000);
    const req = await pastRequest(c, shop.id, { requestedAt });
    const other = await member(shop);
    await pastRequest(other, shop.id, { requestedAt, status: "awaiting_owner" });

    await remindPointRequests(JOBS, new Date(requestedAt.getTime() + REMIND_AFTER_MS - 1_000));
    expect(await noticesOf(owner.id, "request_reminder")).toEqual([]);

    const at30 = new Date(requestedAt.getTime() + REMIND_AFTER_MS);
    await remindPointRequests(JOBS, at30);
    await remindPointRequests(JOBS, new Date(at30.getTime() + 5 * 60_000));
    for (const u of [owner, staff]) {
      const n = await noticesOf(u.id, "request_reminder");
      expect(n.map((x) => (x.payload as { requestId: string }).requestId)).toEqual([req.id]);
    }
    expect(await noticesOf(gone.id, "request_reminder")).toEqual([]);
    expect(await noticesOf(c.id, "request_reminder")).toEqual([]);
    expect((await requestsOf(c.id))[0]?.remindedAt).toBeInstanceOf(Date);
  });
});
