import { describe, expect, it } from "vitest";
import type { ShopId } from "@/lib/brand";
import { TEMPLATES, type ProgrammeVersion } from "@/lib/loyalty/programme";
import { PULL_MAX, PULL_THRESHOLD, pullDistance } from "./pull";
import {
  type WalletCardInput,
  compareWallet,
  firstNameOf,
  goldText,
  greeting,
  ingotPercent,
  ingotsText,
  progressLabel,
  totalText,
  sortWallet,
  STACK_SIZE,
  stackGroups,
  walletCard,
  walletView,
} from "./view";

// Wed 18 Nov 2026, 10:00 GMT (London = UTC in November).
const NOW = new Date("2026-11-18T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const V1: ProgrammeVersion[] = [
  {
    ...TEMPLATES.cafe.rules,
    ingotSize: 1_000,
    id: "v1",
    version: 1,
    activeFrom: new Date(NOW.getTime() - 60 * DAY),
    rewardsFrom: new Date(NOW.getTime() - 60 * DAY),
    createdAt: new Date(NOW.getTime() - 60 * DAY),
  },
];

let seq = 0;
const input = (over: Partial<WalletCardInput> = {}): WalletCardInput => {
  seq += 1;
  return {
    membershipId: `m-${String(seq).padStart(3, "0")}`,
    shopId: `s-${String(seq)}` as ShopId,
    name: `Shop ${String(seq)}`,
    addressLine1: "67 Camden High St",
    town: "Camden",
    postcode: "NW1 7JR",
    logoUrl: null,
    coverUrl: null,
    status: "active",
    joinedAt: new Date(NOW.getTime() - 30 * DAY),
    purchaseCount: 0,
    lastVisitAt: null,
    progressGold: 0,
    ingotsCompleted: 0,
    versions: V1,
    hours: [],
    closures: [],
    recentAwards: [],
    ...over,
  };
};

const key = (
  name: string,
  purchaseCount: number,
  progressGold: number,
  lastVisitAt: Date | null,
  membershipId = name,
) => ({ name, membershipId, purchaseCount, progressGold, lastVisitAt });

describe("[P1-07] wallet sort order (PRODUCT §4)", () => {
  it("purchase count first, highest first", () => {
    const out = sortWallet([key("a", 1, 900, NOW), key("b", 5, 0, null), key("c", 3, 0, null)]);
    expect(out.map((c) => c.name)).toEqual(["b", "c", "a"]);
  });

  it("equal purchase counts: current points, highest first", () => {
    const out = sortWallet([key("a", 2, 100, NOW), key("b", 2, 720, null), key("c", 2, 300, NOW)]);
    expect(out.map((c) => c.name)).toEqual(["b", "c", "a"]);
  });

  it("equal counts and points: most recent visit first, never-visited last", () => {
    const early = new Date(NOW.getTime() - 5 * DAY);
    const out = sortWallet([
      key("a", 2, 100, early),
      key("b", 2, 100, null),
      key("c", 2, 100, NOW),
    ]);
    expect(out.map((c) => c.name)).toEqual(["c", "a", "b"]);
  });

  it("full ties fall back to name, then membership id, so the order is stable", () => {
    const out = sortWallet([
      key("Zed", 0, 0, null, "m2"),
      key("Ale", 0, 0, null, "m9"),
      key("Ale", 0, 0, null, "m1"),
    ]);
    expect(out.map((c) => `${c.name}/${c.membershipId}`)).toEqual(["Ale/m1", "Ale/m9", "Zed/m2"]);
    expect(compareWallet(key("x", 1, 1, NOW, "m"), key("x", 1, 1, NOW, "m"))).toBe(0);
  });

  it("does not mutate its input", () => {
    const list = [key("a", 0, 0, null), key("b", 9, 0, null)];
    sortWallet(list);
    expect(list.map((c) => c.name)).toEqual(["a", "b"]);
  });
});

describe("[P1-07] wallet progress label", () => {
  it("percent with the visits estimate once there are 3+ visits", () => {
    expect(
      progressLabel({ progressGold: 720, ingotSize: 1_000, approvedVisits: 9, visitsToNext: 1 }),
    ).toBe("72% · 1 more visit");
    expect(
      progressLabel({ progressGold: 300, ingotSize: 1_000, approvedVisits: 3, visitsToNext: 7 }),
    ).toBe("30% · 7 more visits");
  });

  it("fewer than 3 visits: percent only (estimate unreliable)", () => {
    expect(
      progressLabel({ progressGold: 200, ingotSize: 1_000, approvedVisits: 2, visitsToNext: 8 }),
    ).toBe("20%");
  });

  it("no estimate: percent only", () => {
    expect(
      progressLabel({ progressGold: 200, ingotSize: 1_000, approvedVisits: 6, visitsToNext: null }),
    ).toBe("20%");
  });

  it("a shop without a programme says so", () => {
    expect(
      progressLabel({ progressGold: 0, ingotSize: null, approvedVisits: 0, visitsToNext: null }),
    ).toBe("Rewards not set up yet");
  });

  it("percent rounds down: 999 of 1,000 is 99%, never a full ingot", () => {
    expect(ingotPercent(999, 1_000)).toBe(99);
    expect(ingotPercent(1, 1_000)).toBe(0);
    expect(ingotPercent(0, 1_000)).toBe(0);
    expect(ingotPercent(5, 0)).toBe(0);
    expect(ingotPercent(2_000, 1_000)).toBe(100);
  });
});

describe("[P1-07] wallet greeting and copy", () => {
  it("greets by London time of day", () => {
    // The reference's header: the time of day small, the first name large (P1-B close design review).
    expect(greeting(new Date("2026-11-18T09:00:00Z"), "Aisha")).toEqual({
      part: "Good morning",
      name: "Aisha",
    });
    expect(greeting(new Date("2026-11-18T12:00:00Z"), "Aisha").part).toBe("Good afternoon");
    expect(greeting(new Date("2026-11-18T18:00:00Z"), null)).toEqual({
      part: "Good evening",
      name: null,
    });
    // BST: 11:30 UTC on 1 Jul is 12:30 in London.
    expect(greeting(new Date("2026-07-01T11:30:00Z"), "Aisha").part).toBe("Good afternoon");
    // Just after midnight in London.
    expect(greeting(new Date("2026-07-01T23:10:00Z"), null).part).toBe("Good morning");
  });

  it("first name from the full name", () => {
    expect(firstNameOf("  Aisha  Khan ")).toBe("Aisha");
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });

  it("number copy uses UK grouping and plurals", () => {
    expect(ingotsText(1)).toBe("1 ingot filled");
    expect(ingotsText(12)).toBe("12 ingots filled");
    expect(goldText(720, 1_000)).toBe("720 / 1,000 gold");
    expect(totalText(1)).toBe("gold across 1 shop");
    expect(totalText(3)).toBe("gold across 3 shops");
  });
});

describe("[P1-07] wallet cards", () => {
  it("maps a member's progress through the engine: 720 of 1,000 with history → estimate", () => {
    const card = walletCard(
      input({ progressGold: 720, purchaseCount: 9, recentAwards: [100, 100, 100] }),
      NOW,
    );
    expect(card.progress).toBeCloseTo(0.72);
    expect(card.ingotSize).toBe(1_000);
    expect(card.label).toBe("72% · 3 more visits");
    // The visible line is the reference's `.wc-meta` (gold of the ingot · the reward it fills towards); the
    // percent and visits hint stay in the card's accessible name (P1-B close design review).
    expect(card.meta).toBe("720 / 1,000 · Free drink of your choice");
    expect(card.reward).toBe("Free drink of your choice");
    expect(card.address).toBe("67 Camden High St, Camden");
  });

  it("no ledger history yet: percent only", () => {
    expect(walletCard(input({ progressGold: 720, purchaseCount: 9 }), NOW).label).toBe("72%");
  });

  it("no programme: zero progress and the not-set-up label", () => {
    const card = walletCard(input({ versions: [] }), NOW);
    expect(card.meta).toBe("Rewards not set up yet");
    expect(card.progress).toBe(0);
    expect(card.ingotSize).toBeNull();
    expect(card.label).toBe("Rewards not set up yet");
  });

  it("suspended and closed shops are flagged and show no opening status", () => {
    const hours = [{ weekday: 3, opens: "08:00", closes: "18:00" }];
    expect(walletCard(input({ status: "suspended", hours }), NOW)).toMatchObject({
      availability: "suspended",
      open: null,
    });
    expect(walletCard(input({ status: "closed", hours }), NOW).availability).toBe("closed");
    // Grace / restricted / expiring plans are still live shops.
    expect(walletCard(input({ status: "grace", hours }), NOW).availability).toBe("live");
  });

  it("live shop with hours gets an open status; without hours none (never a false 'Closed')", () => {
    // Wednesday 10:00 London.
    const open = walletCard(
      input({ hours: [{ weekday: 3, opens: "08:00", closes: "18:00" }] }),
      NOW,
    );
    expect(open.open).toEqual({ tone: "open", text: "Open · closes 18:00" });
    expect(walletCard(input(), NOW).open).toBeNull();
  });

  it("address falls back to the postcode, or none", () => {
    expect(walletCard(input({ town: null }), NOW).address).toBe("67 Camden High St, NW1 7JR");
    expect(
      walletCard(input({ addressLine1: null, town: null, postcode: null }), NOW).address,
    ).toBeNull();
  });

  it("view: sorted cards and the summary strip totals", () => {
    const view = walletView(
      [
        input({ name: "Low", purchaseCount: 1, ingotsCompleted: 2 }),
        input({ name: "High", purchaseCount: 7, ingotsCompleted: 3 }),
      ],
      2,
      NOW,
    );
    expect(view.cards.map((c) => c.name)).toEqual(["High", "Low"]);
    expect(view.summary).toEqual({ rewardsReady: 2, ingotsCompleted: 5, gold: 0, shops: 2 });
    expect(walletView([], 0, NOW)).toEqual({
      cards: [],
      summary: { rewardsReady: 0, ingotsCompleted: 0, gold: 0, shops: 0 },
    });
  });

  it("view: the total panel sums the gold the cards show (shops with a programme), across every shop", () => {
    const view = walletView(
      [
        input({ progressGold: 360 }),
        input({ progressGold: 1_400, status: "suspended" }),
        input({ progressGold: 720 }),
        // No programme: the card shows no gold, so none counts (a stale balance never inflates the total).
        input({ progressGold: 50, versions: [] }),
      ],
      0,
      NOW,
    );
    expect(view.summary.gold).toBe(2_480);
    expect(view.summary.shops).toBe(4);
  });
});

describe("[P1-07] wallet pull-to-refresh distance", () => {
  it("half the finger's travel, clamped to 0…max", () => {
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(-30)).toBe(0);
    expect(pullDistance(Number.NaN)).toBe(0);
    expect(pullDistance(10_000)).toBe(PULL_MAX);
    expect(pullDistance(PULL_THRESHOLD * 2)).toBe(PULL_THRESHOLD);
  });
});

describe("[PD-08] wallet stack groups (DESIGN §6.4)", () => {
  const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

  it("[PD-08] no shops: no stack; one shop: a single card, no stack behind it", () => {
    expect(stackGroups([])).toEqual([]);
    expect(stackGroups(ids(1))).toEqual([[0]]);
  });

  it("[PD-08] long lists stack in groups of three, in Wallet order; the last group holds the rest", () => {
    expect(STACK_SIZE).toBe(3);
    expect(stackGroups(ids(3))).toEqual([[0, 1, 2]]);
    expect(stackGroups(ids(4))).toEqual([[0, 1, 2], [3]]);
    expect(stackGroups(ids(5))).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    const thirty = stackGroups(ids(30));
    expect(thirty).toHaveLength(10);
    expect(thirty.every((g) => g.length === 3)).toBe(true);
    expect(thirty.flat()).toEqual(ids(30));
  });

  it("[PD-08] a group size below one is refused (it would loop forever or drop cards)", () => {
    expect(() => stackGroups(ids(3), 0)).toThrow(/size/);
  });
});
