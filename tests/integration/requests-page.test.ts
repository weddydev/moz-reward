import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { pointRequests, shops } from "@/server/db/schema";
import {
  countRequestTabs,
  listTeamRequestsPage,
  readQuickPicks,
  type RequestsTab,
} from "@/server/repos/point-requests";
import {
  makeCustomerProfile,
  makeMembership,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";

const NOW = new Date("2026-11-28T15:00:00Z");
const opts = {
  requestedAfter: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
  dayStart: new Date("2026-11-28T00:00:00Z"), // London is on GMT in November
};

type Seed = {
  status: "pending" | "awaiting_owner" | "approved" | "rejected" | "expired";
  /** Postgres time text, microseconds allowed. */
  requested: string;
  decided?: string;
};

/** A member of `shopId` with one request in the given state, written past the web role's guard. */
async function requestIn(shopId: string, s: Seed, name = "Ana Lopes"): Promise<string> {
  const user = await makeUser();
  await makeCustomerProfile(user.id, { fullName: name });
  const m = await makeMembership(user.id, shopId, { joinedAt: new Date("2026-10-01T10:00:00Z") });
  const id = newId();
  await db()
    .insert(pointRequests)
    .values({
      id,
      membershipId: m.id,
      userId: user.id,
      shopId,
      status: s.status,
      idempotencyKey: newId(),
      requestedAt: sql`${s.requested}::timestamptz`,
      decidedAt: s.decided ? sql`${s.decided}::timestamptz` : null,
      awardGold: s.status === "approved" || s.status === "awaiting_owner" ? 40 : null,
      rejectReason: s.status === "rejected" ? "no_purchase" : null,
    });
  return id;
}

async function shopWithTeam() {
  const [owner, staff, shop] = await Promise.all([
    makeUser(),
    makeUser(),
    makeShop({ status: "active" }),
  ]);
  await Promise.all([makeStaff(shop.id, owner.id, "owner"), makeStaff(shop.id, staff.id, "staff")]);
  return {
    shop,
    owner: mintShopScope({ userId: owner.id, shopId: shop.id, role: "owner" }),
    staff: mintShopScope({ userId: staff.id, shopId: shop.id, role: "staff" }),
  };
}

const ids = async (scope: Parameters<typeof listTeamRequestsPage>[0], tab: RequestsTab) =>
  (await listTeamRequestsPage(scope, { ...opts, tab, before: null, limit: 25 })).rows.map(
    (r) => r.id,
  );

describe("[P2-02] Requests page tabs", () => {
  it("[P2-02] puts each request in its tab, newest first, and only the shop's own", async () => {
    const a = await shopWithTeam();
    const b = await shopWithTeam();
    const p1 = await requestIn(a.shop.id, {
      status: "pending",
      requested: "2026-11-28 14:00:00+00",
    });
    const p2 = await requestIn(a.shop.id, {
      status: "pending",
      requested: "2026-11-28 14:30:00+00",
    });
    const w1 = await requestIn(a.shop.id, {
      status: "awaiting_owner",
      requested: "2026-11-28 13:00:00+00",
    });
    const ok1 = await requestIn(a.shop.id, {
      status: "approved",
      requested: "2026-11-27 23:00:00+00",
      decided: "2026-11-28 09:00:00+00",
    });
    // Approved yesterday (UK): not "today".
    await requestIn(a.shop.id, {
      status: "approved",
      requested: "2026-11-27 20:00:00+00",
      decided: "2026-11-27 23:59:00+00",
    });
    await requestIn(a.shop.id, {
      status: "rejected",
      requested: "2026-11-28 10:00:00+00",
      decided: "2026-11-28 10:05:00+00",
    });
    const x1 = await requestIn(a.shop.id, {
      status: "expired",
      requested: "2026-11-26 10:00:00+00",
      decided: "2026-11-27 10:00:00+00",
    });
    // Past its 24 h, the expiry job not run yet: shown as expired, not pending.
    const x2 = await requestIn(a.shop.id, {
      status: "pending",
      requested: "2026-11-27 14:59:00+00",
    });
    // Another shop's requests never show.
    await requestIn(b.shop.id, { status: "pending", requested: "2026-11-28 14:45:00+00" });
    await requestIn(b.shop.id, {
      status: "approved",
      requested: "2026-11-28 08:00:00+00",
      decided: "2026-11-28 08:10:00+00",
    });

    for (const scope of [a.owner, a.staff]) {
      expect(await ids(scope, "pending")).toEqual([p2, p1]);
      expect(await ids(scope, "awaiting")).toEqual([w1]);
      expect(await ids(scope, "approved")).toEqual([ok1]);
      expect(await ids(scope, "expired")).toEqual([x2, x1]);
      expect(await countRequestTabs(scope, opts)).toEqual({ pending: 2, awaiting: 1, approved: 1 });
    }
  });

  it("[P2-02] gives each row the member card, status, source and streak", async () => {
    const a = await shopWithTeam();
    await requestIn(
      a.shop.id,
      { status: "pending", requested: "2026-11-28 14:00:00+00" },
      "Bea Khan",
    );
    const [row] = (
      await listTeamRequestsPage(a.staff, { ...opts, tab: "pending", before: null, limit: 25 })
    ).rows;
    expect(row).toMatchObject({
      status: "pending",
      source: "request",
      decidedAt: null,
      member: { name: "Bea Khan" },
      streak: { weeks: 0, lastWeekStart: null },
    });
    expect(row?.member?.memberId).toMatch(/^[0-9A-Z]{6}$/);
  });

  it("[P2-02] pages with a keyset cursor: no row skipped or repeated, even within a millisecond", async () => {
    const a = await shopWithTeam();
    const made: string[] = [];
    // Five requests inside one millisecond (microseconds apart) and two more later.
    for (const us of ["100001", "100002", "100003", "100004", "100005"]) {
      made.push(
        await requestIn(a.shop.id, {
          status: "pending",
          requested: `2026-11-28 14:00:00.${us}+00`,
        }),
      );
    }
    made.push(
      await requestIn(a.shop.id, { status: "pending", requested: "2026-11-28 14:10:00+00" }),
    );
    made.push(
      await requestIn(a.shop.id, { status: "pending", requested: "2026-11-28 14:20:00+00" }),
    );

    const seen: string[] = [];
    let before: { at: string; id: string } | null = null;
    let pages = 0;
    do {
      const page = await listTeamRequestsPage(a.owner, {
        ...opts,
        tab: "pending",
        before,
        limit: 2,
      });
      seen.push(...page.rows.map((r) => r.id));
      before = page.next;
      pages += 1;
    } while (before && pages < 10);
    expect(pages).toBe(4);
    expect(seen).toEqual([...made].reverse());
  });

  it("[P2-02] clamps the page size to the queue limit", async () => {
    const a = await shopWithTeam();
    await requestIn(a.shop.id, { status: "pending", requested: "2026-11-28 14:00:00+00" });
    const page = await listTeamRequestsPage(a.owner, {
      ...opts,
      tab: "pending",
      before: null,
      limit: 10_000,
    });
    expect(page.rows).toHaveLength(1);
    expect(page.next).toBeNull();
  });
});

describe("[P2-02] approve quick-picks", () => {
  it("[P2-02] reads the shop's own quick-picks, empty by default", async () => {
    const a = await shopWithTeam();
    const b = await shopWithTeam();
    expect(await readQuickPicks(a.staff)).toEqual([]);
    const picks = [
      { label: "Flat white", pricePence: 340 },
      { label: "Stamp", pricePence: null },
    ];
    await db().update(shops).set({ quickPicks: picks }).where(eq(shops.id, b.shop.id));
    expect(await readQuickPicks(b.staff)).toEqual(picks);
    expect(await readQuickPicks(a.owner)).toEqual([]);
  });

  it("[P2-02] the database refuses more than 8 quick-picks or a non-list", async () => {
    const a = await shopWithTeam();
    const nine = Array.from({ length: 9 }, (_, i) => ({
      label: `Item ${String(i)}`,
      pricePence: 100,
    }));
    await expect(
      db().update(shops).set({ quickPicks: nine }).where(eq(shops.id, a.shop.id)),
    ).rejects.toThrow();
    await expect(
      db().execute(sql`UPDATE shops SET quick_picks = '{"a":1}'::jsonb WHERE id = ${a.shop.id}`),
    ).rejects.toThrow();
  });
});
