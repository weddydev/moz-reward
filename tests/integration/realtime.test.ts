import { and, eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { TEMPLATES } from "@/lib/loyalty/programme";
import { validStreamSessions } from "@/server/auth/stream-sessions";
import {
  mintAdminScope,
  mintCustomerScope,
  mintShopScope,
  type ShopScope,
  systemScope,
} from "@/server/authz/scope";
import { dbAs, testOwnerDb as db } from "@/server/db/client";
import { memberships, notifications, outbox, sessions, shopStaff } from "@/server/db/schema";
import { env } from "@/server/env";
import { cacheUrl } from "@/server/jobs/connection";
import { sendLoyaltyChangeNotices } from "@/server/notifications/loyalty-notice";
import { notify } from "@/server/notifications/notify";
import { createHub, type Hub, type StreamConn } from "@/server/realtime/hub";
import { deliverRealtime, publishRealtime, realtimeChannel } from "@/server/realtime/publish";
import { transaction } from "@/server/repos/_base";
import { ensureNotificationPartitions, listOwnNotifications } from "@/server/repos/notifications";
import { saveProgramme } from "@/server/services/loyalty-programme";
import { makeMembership, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/**
 * P1-10 realtime + notify, against the real Postgres and redis-cache. Hubs here are separate instances with
 * their own subscriber connections, i.e. what two web processes are.
 */
const RUN = newId().slice(-8);
const hubs: Hub[] = [];
const conns: Redis[] = [];

function subscriberConn(name: string): Redis {
  const r = new Redis(cacheUrl(), {
    connectionName: `moz:subscriber:test-${RUN}-${name}`,
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    autoResubscribe: true,
    retryStrategy: () => 50,
  });
  conns.push(r);
  return r;
}

function makeTestHub(name: string, heartbeatMs = 60_000): Hub {
  const hub = createHub({
    subscriber: () => subscriberConn(name),
    channelPrefix: env().REDIS_KEY_PREFIX,
    checkSessions: validStreamSessions,
    now: Date.now,
    rand: Math.random,
    heartbeatMs,
    caps: { perUser: 5, perShop: 50, total: 2_000 },
    warn: () => undefined,
  });
  hubs.push(hub);
  return hub;
}

type Reader = {
  text: () => string;
  closed: () => boolean;
  waitFor: (re: RegExp, ms?: number) => Promise<void>;
};

function collect(stream: ReadableStream<Uint8Array>): Reader {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let done = false;
  void (async () => {
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        out += decoder.decode(r.value);
      }
    } catch {
      // errored stream
    }
    done = true;
  })();
  return {
    text: () => out,
    closed: () => done,
    waitFor: async (re, ms = 3_000) => {
      const until = Date.now() + ms;
      while (!re.test(out)) {
        if (Date.now() > until) throw new Error(`timed out waiting for ${String(re)}; got: ${out}`);
        await new Promise((r) => setTimeout(r, 20));
      }
    },
  };
}

function open(hub: Hub, conn: StreamConn): Reader {
  const r = hub.open(conn);
  if (!r.ok) throw new Error(`not opened: ${r.reason}`);
  return collect(r.stream);
}

async function sessionFor(userId: string): Promise<string> {
  const [row] = await db()
    .insert(sessions)
    .values({ userId, token: `t_${newId()}`, expiresAt: new Date(Date.now() + 3_600_000) })
    .returning({ id: sessions.id });
  if (!row) throw new Error("no session");
  return row.id;
}

const userConn = (userId: string, sessionId: string): StreamConn => ({
  userId,
  sessionId,
  deadline: Number.POSITIVE_INFINITY,
  channel: { kind: "user", id: userId },
});

let admin: Redis;
beforeAll(() => {
  admin = new Redis(cacheUrl());
});
afterEach(() => {
  for (const h of hubs.splice(0)) h.dispose();
});
afterAll(async () => {
  for (const c of conns) c.disconnect();
  await admin.quit();
});

async function shopWithTeam() {
  const shop = await makeShop();
  const owner = await makeUser();
  const staff = await makeUser();
  await makeStaff(shop.id, owner.id, "owner");
  await makeStaff(shop.id, staff.id, "staff", { perAwardLimit: 100 });
  return {
    shop,
    ownerId: owner.id,
    staffId: staff.id,
    owner: mintShopScope({ userId: owner.id, shopId: shop.id, role: "owner" }),
    staff: mintShopScope({ userId: staff.id, shopId: shop.id, role: "staff" }),
  };
}

/** SQLSTATE of the failure (drizzle wraps the driver error in `cause`); 42501 = insufficient privilege / RLS. */
async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

const outboxRows = (where: { queue: string; jobName: string }) =>
  db()
    .select()
    .from(outbox)
    .where(and(eq(outbox.queue, where.queue), eq(outbox.jobName, where.jobName)));

describe("[P1-10] fan-out across two app instances", () => {
  it("an event published once reaches the user's streams on both instances", async () => {
    const user = await makeUser();
    const sid = await sessionFor(user.id);
    const a = open(makeTestHub("a"), userConn(user.id, sid));
    const b = open(makeTestHub("b"), userConn(user.id, sid));
    await Promise.all([a.waitFor(/event: ready/), b.waitFor(/event: ready/)]);
    // Wait until both subscriptions are live on the server.
    const channel = realtimeChannel({ kind: "user", id: user.id });
    for (let i = 0; i < 100; i++) {
      const [, n] = (await admin.pubsub("NUMSUB", channel)) as [string, number];
      if (n === 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const shopId = newId();
    const receivers = await deliverRealtime({
      targets: [{ kind: "user", id: user.id }],
      event: { type: "points_credited", data: { shopId } },
    });
    expect(receivers).toBe(2);
    await Promise.all([
      a.waitFor(/event: points_credited\ndata: \{"shopId":"[0-9a-f-]+"\}/),
      b.waitFor(/event: points_credited/),
    ]);
  });
});

describe("[P1-10] streams end with the session", () => {
  it("a session revoked mid-stream is closed within one heartbeat with an auth event", async () => {
    const user = await makeUser();
    const sid = await sessionFor(user.id);
    const s = open(makeTestHub("rev", 150), userConn(user.id, sid));
    await s.waitFor(/event: ready/);
    await db().delete(sessions).where(eq(sessions.id, sid));
    await s.waitFor(/event: auth\ndata: \{"reason":"signed_out"\}/, 1_000);
    expect(s.closed()).toBe(true);
  });

  it("a staff member removed from the shop loses the shop stream (the role change ends their sessions)", async () => {
    const { shop, staffId } = await shopWithTeam();
    const sid = await sessionFor(staffId);
    const s = open(makeTestHub("staff", 150), {
      userId: staffId,
      sessionId: sid,
      deadline: Date.now() + 3_600_000,
      channel: { kind: "shop", id: shop.id },
    });
    await s.waitFor(/event: ready/);
    await db()
      .update(shopStaff)
      .set({ active: false })
      .where(and(eq(shopStaff.shopId, shop.id), eq(shopStaff.userId, staffId)));
    await s.waitFor(/event: auth/, 1_000);
    expect(s.closed()).toBe(true);
  });
});

describe("[P1-10] Redis restart", () => {
  it("the subscriber re-attaches: degraded, then ready, then events flow again", async () => {
    const user = await makeUser();
    const sid = await sessionFor(user.id);
    const s = open(makeTestHub("kill"), userConn(user.id, sid));
    await s.waitFor(/event: ready/);
    const list = await admin.client("LIST");
    const id = /id=(\d+) .*name=moz:subscriber:test-[\w-]*-kill/.exec(String(list))?.[1];
    expect(id).toBeDefined();
    await admin.client("KILL", "ID", id!);
    await s.waitFor(/event: degraded/);
    await s.waitFor(/event: ready[\s\S]*event: degraded[\s\S]*event: ready/, 5_000);
    const channel = realtimeChannel({ kind: "user", id: user.id });
    for (let i = 0; i < 100; i++) {
      const [, n] = (await admin.pubsub("NUMSUB", channel)) as [string, number];
      if (n === 1) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await deliverRealtime({
      targets: [{ kind: "user", id: user.id }],
      event: { type: "notification", data: {} },
    });
    await s.waitFor(/event: notification/);
  });
});

describe("[P1-10] 1,000 connect/disconnect cycles leave nothing behind", () => {
  it("no streams, no channels, no Redis subscriptions, listeners unchanged", async () => {
    const hub = makeTestHub("loop");
    const users = [newId(), newId(), newId()];
    for (let i = 0; i < 1_000; i++) {
      const userId = users[i % 3]!;
      const r = hub.open(userConn(userId, newId()));
      if (!r.ok) throw new Error(r.reason);
      if (i % 2 === 0) await r.stream.cancel();
      else {
        const ac = new AbortController();
        // Disconnect through the request signal path too (cancel and abort both clean up).
        const again = hub.open({ ...userConn(userId, newId()), signal: ac.signal });
        await r.stream.cancel();
        ac.abort();
        if (again.ok) await again.stream.cancel().catch(() => undefined);
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(hub.stats()).toMatchObject({ streams: 0, channels: 0 });
    for (const u of users) {
      const [, n] = (await admin.pubsub("NUMSUB", realtimeChannel({ kind: "user", id: u }))) as [
        string,
        number,
      ];
      expect(n).toBe(0);
    }
    const sub = conns.at(-1)!;
    expect(sub.listenerCount("message")).toBe(1);
  });
});

describe("[P1-10] notify: never inline, rollback leaves nothing", () => {
  it("a rolled-back transaction leaves no notification, no publish and no email row", async () => {
    const { shop, owner } = await shopWithTeam();
    const member = await makeUser();
    await makeMembership(member.id, shop.id);
    const tag = newId();
    await expect(
      transaction(owner, async (tx) => {
        await notify(owner, tx, [member.id], {
          type: "loyalty_change_notice",
          shopId: shop.id,
          payload: { shopId: shop.id, version: 7, rewardsFrom: new Date().toISOString() },
          dedupe: { key: tag, createdAt: new Date() },
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      await db().select().from(notifications).where(eq(notifications.userId, member.id)),
    ).toEqual([]);
    const published = (await outboxRows({ queue: "notifications", jobName: "publish" })).filter(
      (r) => JSON.stringify(r.payload).includes(member.id),
    );
    expect(published).toEqual([]);
  });

  it("a committed notify writes the row and one publish outbox row, and no email row for an in-app type", async () => {
    const { shop, owner } = await shopWithTeam();
    const member = await makeUser();
    await makeMembership(member.id, shop.id);
    const [id] = await transaction(owner, (tx) =>
      notify(owner, tx, [member.id], {
        type: "loyalty_change_notice",
        shopId: shop.id,
        payload: { shopId: shop.id, version: 2, rewardsFrom: new Date().toISOString() },
      }),
    );
    const rows = await listOwnNotifications(mintCustomerScope({ userId: member.id }));
    expect(rows.map((r) => r.id)).toEqual([id]);
    const published = (await outboxRows({ queue: "notifications", jobName: "publish" })).filter(
      (r) => JSON.stringify(r.payload).includes(member.id),
    );
    expect(published).toHaveLength(1);
    const emails = [
      ...(await outboxRows({ queue: "email", jobName: "notification" })),
      ...(await outboxRows({ queue: "email", jobName: "notification-system" })),
    ].filter((r) => JSON.stringify(r.payload).includes(member.id));
    expect(emails).toEqual([]);
  });

  it("publish targets are checked in the transaction: a team can't hint another shop or a stranger", async () => {
    const a = await shopWithTeam();
    const b = await shopWithTeam();
    const stranger = await makeUser();
    const hint = (
      scope: ShopScope,
      target: { kind: "user" | "shop"; id: string },
      shopId: string,
    ) =>
      transaction(scope, (tx) =>
        publishRealtime(scope, tx, [target], { type: "points_credited", data: { shopId } }),
      );
    await expect(hint(a.owner, { kind: "shop", id: b.shop.id }, b.shop.id)).rejects.toThrow(
      /own shop/,
    );
    await expect(hint(a.owner, { kind: "user", id: stranger.id }, a.shop.id)).rejects.toThrow(
      /members and staff/,
    );
    await expect(
      hint(a.owner, { kind: "user", id: a.staffId }, a.shop.id),
    ).resolves.toBeUndefined();
    const customer = mintCustomerScope({ userId: stranger.id });
    await expect(
      transaction(customer, (tx) =>
        publishRealtime(customer, tx, [{ kind: "shop", id: a.shop.id }], {
          type: "points_credited",
          data: { shopId: a.shop.id },
        }),
      ),
    ).rejects.toThrow(/member of/);
  });
});

describe("[P1-10] notifications RLS and partitions", () => {
  const month = (): string => {
    const d = new Date();
    return `notifications_${String(d.getUTCFullYear())}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  it("the recipient reads only their own; a team can't insert for a non-member or for another shop", async () => {
    const a = await shopWithTeam();
    const b = await shopWithTeam();
    const member = await makeUser();
    const other = await makeUser();
    await makeMembership(member.id, a.shop.id);
    await transaction(a.owner, (tx) =>
      notify(a.owner, tx, [member.id], {
        type: "loyalty_change_notice",
        shopId: a.shop.id,
        payload: { shopId: a.shop.id, version: 3, rewardsFrom: new Date().toISOString() },
      }),
    );
    expect(await listOwnNotifications(mintCustomerScope({ userId: other.id }))).toEqual([]);
    // Bypass the app filter: a raw SELECT as moz_app under another user's scope returns none of them.
    const leaked = await transaction(mintCustomerScope({ userId: other.id }), (tx) =>
      tx.execute(sql`SELECT id FROM notifications WHERE user_id = ${member.id}`),
    );
    expect([...leaked]).toEqual([]);
    // RLS refuses a row for a stranger (not a member or staff of shop A), and shop B writing about shop A.
    const insertAs = (scope: ShopScope, userId: string, shopId: string) =>
      transaction(scope, (tx) =>
        tx.insert(notifications).values({
          id: newId(),
          userId,
          shopId,
          type: "loyalty_change_notice",
          category: "transactional",
          payload: {},
        }),
      );
    expect(await pgCode(() => insertAs(a.owner, other.id, a.shop.id))).toBe("42501");
    expect(await pgCode(() => insertAs(b.owner, member.id, a.shop.id))).toBe("42501");
    // Team members can't read what they wrote (no SELECT policy for the shop scope).
    const seen = await transaction(a.owner, (tx) => tx.execute(sql`SELECT id FROM notifications`));
    expect([...seen]).toEqual([]);
  });

  it("only a shop's team may insert, transactional only, for a current member: customers, every admin role, a left member and marketing are refused", async () => {
    const a = await shopWithTeam();
    const member = await makeUser();
    const left = await makeUser();
    await makeMembership(member.id, a.shop.id);
    await makeMembership(left.id, a.shop.id);
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.userId, left.id));
    const row = (userId: string, category: "transactional" | "marketing" = "transactional") => ({
      id: newId(),
      userId,
      shopId: a.shop.id,
      type: "loyalty_change_notice",
      category,
      payload: {},
    });
    const insertAs = (scope: Parameters<typeof transaction>[0], values: ReturnType<typeof row>) =>
      transaction(scope, (tx) => tx.insert(notifications).values(values));
    // A customer can't write a notification: not for themselves, not for anyone else.
    const me = mintCustomerScope({ userId: member.id });
    expect(await pgCode(() => insertAs(me, row(member.id)))).toBe("42501");
    expect(await pgCode(() => insertAs(me, row(left.id)))).toBe("42501");
    // No admin role may insert in P1 (deny by default).
    for (const role of ["owner", "support", "moderator", "finance"] as const) {
      const admin = mintAdminScope({ userId: (await makeUser()).id, role });
      expect(await pgCode(() => insertAs(admin, row(member.id))), role).toBe("42501");
    }
    // The team: a left member and a marketing row are refused; a transactional row for a current member is not.
    expect(await pgCode(() => insertAs(a.owner, row(left.id)))).toBe("42501");
    expect(await pgCode(() => insertAs(a.owner, row(member.id, "marketing")))).toBe("42501");
    await insertAs(a.owner, row(member.id));
    expect(await listOwnNotifications(me)).toHaveLength(1);
  });

  it("partitions can't be reached directly by the web role; only the worker may create them", async () => {
    const asApp = () =>
      transaction(mintCustomerScope({ userId: newId() }), (tx) =>
        tx.execute(sql.raw(`SELECT 1 FROM ${month()}`)),
      );
    expect(await pgCode(asApp)).toBe("42501");
    expect(
      await pgCode(() => dbAs("app").execute(sql`SELECT ensure_notifications_partitions(3)`)),
    ).toBe("42501");
    expect(
      await pgCode(() => dbAs("auth").execute(sql`SELECT ensure_notifications_partitions(3)`)),
    ).toBe("42501");
    const created = await ensureNotificationPartitions(
      systemScope("test: partitions are ensured"),
      3,
    );
    expect(created).toBeGreaterThanOrEqual(0);
    // Out-of-range input is refused by the function itself (raise_exception).
    expect(
      await pgCode(() => ensureNotificationPartitions(systemScope("test: partitions bounds"), 13)),
    ).toBe("P0001");
  });

  it("a member can mark their own notification read but change nothing else", async () => {
    const a = await shopWithTeam();
    const member = await makeUser();
    await makeMembership(member.id, a.shop.id);
    const [id] = await transaction(a.owner, (tx) =>
      notify(a.owner, tx, [member.id], {
        type: "loyalty_change_notice",
        shopId: a.shop.id,
        payload: { shopId: a.shop.id, version: 4, rewardsFrom: new Date().toISOString() },
      }),
    );
    const me = mintCustomerScope({ userId: member.id });
    await transaction(me, (tx) =>
      tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id!)),
    );
    expect((await listOwnNotifications(me))[0]?.readAt).toBeInstanceOf(Date);
    expect(
      await pgCode(() =>
        transaction(me, (tx) =>
          tx.update(notifications).set({ type: "tampered_type" }).where(eq(notifications.id, id!)),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgCode(() =>
        transaction(me, (tx) => tx.delete(notifications).where(eq(notifications.id, id!))),
      ),
    ).toBe("42501");
  });
});

describe("[P1-10] C-58 programme change notice", () => {
  const rules = TEMPLATES.cafe.rules;

  async function saveV2(owner: ShopScope, now: Date) {
    await transaction(owner, (tx) => saveProgramme(owner, { baseVersion: 0, rules }, tx, now));
    return transaction(owner, (tx) =>
      saveProgramme(
        owner,
        { baseVersion: 1, rules: { ...rules, mainReward: { text: "Free cake" } } },
        tx,
        now,
      ),
    );
  }

  const noticeRows = async (shopId: string) =>
    (await outboxRows({ queue: "notifications", jobName: "loyalty-change-notice" })).filter((r) =>
      JSON.stringify(r.payload).includes(shopId),
    );

  it("a reward change writes the job in the save; every current member gets one notice, left members none, idempotent", async () => {
    const { shop, owner } = await shopWithTeam();
    const current = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const u of current) await makeMembership(u.id, shop.id);
    const left = await makeUser();
    await makeMembership(left.id, shop.id, { leftAt: new Date() });
    const now = new Date();
    const saved = await saveV2(owner, now);
    expect(saved).toMatchObject({ kind: "saved", version: 2 });
    const [row] = await noticeRows(shop.id);
    expect(row?.payload).toMatchObject({ data: { shopId: shop.id, version: 2 } });

    const payload = { shopId: shop.id, version: 2, savedAt: now.toISOString() };
    expect(await sendLoyaltyChangeNotices(payload, owner)).toEqual({ sent: 3 });
    expect(await sendLoyaltyChangeNotices(payload, owner)).toEqual({ sent: 3 }); // retried job
    for (const u of current) {
      const mine = await listOwnNotifications(mintCustomerScope({ userId: u.id }));
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        type: "loyalty_change_notice",
        payload: { shopId: shop.id, version: 2 },
      });
      expect(Object.keys(mine[0]!.payload).sort()).toEqual(["rewardsFrom", "shopId", "version"]);
    }
    expect(await listOwnNotifications(mintCustomerScope({ userId: left.id }))).toEqual([]);
  });

  it("pages through more members than one page holds", async () => {
    const { shop, owner } = await shopWithTeam();
    const users = await Promise.all(Array.from({ length: 105 }, () => makeUser()));
    await db()
      .insert(memberships)
      .values(users.map((u) => ({ userId: u.id, shopId: shop.id })));
    const res = await sendLoyaltyChangeNotices(
      { shopId: shop.id, version: 1, savedAt: new Date().toISOString() },
      owner,
    ).catch((e: unknown) => e);
    // Version 1 doesn't exist yet here: unreadable, nothing sent.
    expect(res).toEqual({ sent: 0, unreadable: true });
    const now = new Date();
    await saveV2(owner, now);
    expect(
      await sendLoyaltyChangeNotices(
        { shopId: shop.id, version: 2, savedAt: now.toISOString() },
        owner,
      ),
    ).toEqual({ sent: 105 });
  });

  it("a rolled-back save writes no notice job; a save without a reward change writes none", async () => {
    const { shop, owner } = await shopWithTeam();
    await transaction(owner, (tx) => saveProgramme(owner, { baseVersion: 0, rules }, tx));
    await expect(
      transaction(owner, async (tx) => {
        await saveProgramme(
          owner,
          { baseVersion: 1, rules: { ...rules, mainReward: { text: "Gone" } } },
          tx,
        );
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await transaction(owner, (tx) =>
      saveProgramme(
        owner,
        { baseVersion: 1, rules: { ...rules, earnRate: rules.earnRate + 1 } },
        tx,
      ),
    );
    expect(await noticeRows(shop.id)).toEqual([]);
  });

  it("an owner who lost the role before the job ran: nothing sent, distinct from zero members", async () => {
    const { shop, owner, ownerId } = await shopWithTeam();
    const member = await makeUser();
    await makeMembership(member.id, shop.id);
    const now = new Date();
    await saveV2(owner, now);
    await db()
      .update(shopStaff)
      .set({ active: false })
      .where(and(eq(shopStaff.shopId, shop.id), eq(shopStaff.userId, ownerId)));
    expect(
      await sendLoyaltyChangeNotices(
        { shopId: shop.id, version: 2, savedAt: now.toISOString() },
        owner,
      ),
    ).toEqual({ sent: 0, unreadable: true });
    expect(await listOwnNotifications(mintCustomerScope({ userId: member.id }))).toEqual([]);
  });
});
