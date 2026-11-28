import { describe, expect, it } from "vitest";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import { AMOUNT_PENCE_MAX, REQUEST_ITEMS } from "@/lib/requests";
import {
  mergeItems,
  type PadKey,
  padDisplay,
  padPress,
  type PickState,
  previewGold,
  type PreviewContext,
  type QuickPick,
  togglePick,
} from "./approve-pad";

function type(keys: string): string {
  let text = "";
  for (const k of keys) text = padPress(text, (k === "<" ? "back" : k) as PadKey);
  return text;
}

describe("[P2-02] approve number pad", () => {
  it("[P2-02] types pounds and pence", () => {
    expect(type("1250")).toBe("1250");
    expect(type("12.5")).toBe("12.5");
    expect(type("12.50")).toBe("12.50");
    expect(type(".5")).toBe("0.5");
  });

  it("[P2-02] refuses a second point, a third decimal and leading zeros", () => {
    expect(type("1.2.3")).toBe("1.23");
    expect(type("1.239")).toBe("1.23");
    expect(type("007")).toBe("7");
  });

  it("[P2-02] deletes the last character and stops at empty", () => {
    expect(type("12.5<")).toBe("12.");
    expect(type("1<<<")).toBe("");
  });

  it("[P2-02] never goes above the largest amount a request may carry", () => {
    const max = String(AMOUNT_PENCE_MAX / 100);
    expect(type(max)).toBe(max);
    expect(type(`${max}1`)).toBe(max);
    expect(type("999999")).toBe("99999");
    expect(type(`${max}.5`)).toBe(`${max}.`);
    expect(type(`${max}.0`)).toBe(`${max}.0`);
  });

  it("[P2-02] shows £0 when empty and the typed text otherwise", () => {
    expect(padDisplay("")).toBe("£0");
    expect(padDisplay("12.5")).toBe("£12.5");
  });
});

const PICKS: QuickPick[] = [
  { label: "Flat white", pricePence: 340 },
  { label: "Croissant", pricePence: 295 },
  { label: "Loyalty stamp", pricePence: null },
];
const empty: PickState = { picked: [], amount: "", typed: false };

describe("[P2-02] approve quick-picks", () => {
  it("[P2-02] adds the item and sums the picked prices into the amount", () => {
    const a = togglePick(empty, PICKS[0]!, PICKS);
    expect(a).toEqual({ picked: ["Flat white"], amount: "3.40", typed: false });
    const b = togglePick(a, PICKS[1]!, PICKS);
    expect(b).toEqual({ picked: ["Flat white", "Croissant"], amount: "6.35", typed: false });
    expect(togglePick(b, PICKS[0]!, PICKS)).toEqual({
      picked: ["Croissant"],
      amount: "2.95",
      typed: false,
    });
  });

  it("[P2-02] a pick without a price adds only the item", () => {
    expect(togglePick(empty, PICKS[2]!, PICKS)).toEqual({
      picked: ["Loyalty stamp"],
      amount: "",
      typed: false,
    });
  });

  it("[P2-02] keeps a hand-typed amount and changes only the items", () => {
    const typed: PickState = { picked: [], amount: "20", typed: true };
    expect(togglePick(typed, PICKS[0]!, PICKS)).toEqual({
      picked: ["Flat white"],
      amount: "20",
      typed: true,
    });
  });

  it("[P2-02] refuses more items than a request may carry", () => {
    const many: QuickPick[] = Array.from({ length: REQUEST_ITEMS.max + 1 }, (_, i) => ({
      label: `Item ${String(i)}`,
      pricePence: 100,
    }));
    let s = empty;
    for (const p of many) s = togglePick(s, p, many);
    expect(s.picked).toHaveLength(REQUEST_ITEMS.max);
    expect(s.amount).toBe(String(REQUEST_ITEMS.max));
  });

  it("[P2-02] merges picked and typed items without repeats (case-insensitive)", () => {
    expect(mergeItems(["Flat white"], ["flat white", "Muffin"])).toEqual(["Flat white", "Muffin"]);
    expect(mergeItems([], [])).toEqual([]);
  });
});

const version = (over: Partial<ProgrammeVersion>): ProgrammeVersion =>
  ({
    id: "v1",
    version: 1,
    activeFrom: new Date("2026-01-01T00:00:00Z"),
    rewardsFrom: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    earnMode: "per_pound",
    earnRate: 2,
    ingotSize: 500,
    mainReward: { text: "Free coffee" },
    milestones: [],
    streak: null,
    tiers: { silver: 5, gold: 15 },
    expiryMonths: 24,
    rewardValidDays: 180,
    ...over,
  }) satisfies ProgrammeVersion;

const ctx = (over: Partial<PreviewContext> = {}): PreviewContext => ({
  versions: [version({})],
  requestedAt: new Date("2026-11-26T14:05:00Z"),
  streak: { weeks: 0, lastWeekStart: null },
  cap: { pence: 50_000, gold: 500 },
  limit: null,
  ...over,
});

describe("[P2-02] live gold preview", () => {
  it("[P2-02] prices a per-pound award from the rules active at the request time", () => {
    expect(previewGold(ctx(), 4200)).toEqual({
      kind: "gold",
      gold: 84,
      streakBonus: 0,
      toOwner: false,
    });
  });

  it("[P2-02] uses the version active when the member asked, not the newest", () => {
    const versions = [
      version({}),
      version({ id: "v2", version: 2, earnRate: 5, activeFrom: new Date("2026-11-27T00:00:00Z") }),
    ];
    expect(previewGold(ctx({ versions }), 1000)).toMatchObject({ kind: "gold", gold: 20 });
  });

  it("[P2-02] asks for the amount on a per-pound programme, not on a per-visit one", () => {
    expect(previewGold(ctx(), null)).toEqual({ kind: "needs-amount" });
    const perVisit = [version({ earnMode: "per_visit", earnRate: 10 })];
    expect(previewGold(ctx({ versions: perVisit }), null)).toMatchObject({ gold: 10 });
  });

  it("[P2-02] adds the streak bonus when this visit extends a streak", () => {
    const versions = [version({ streak: { bonusGold: 25 } })];
    const streak = { weeks: 1, lastWeekStart: "2026-11-16" };
    expect(previewGold(ctx({ versions, streak }), 1000)).toEqual({
      kind: "gold",
      gold: 45,
      streakBonus: 25,
      toOwner: false,
    });
  });

  it("[P2-02] flags an award above the staff limit as going to the owner", () => {
    expect(previewGold(ctx({ limit: 50 }), 4200)).toMatchObject({ gold: 84, toOwner: true });
    expect(previewGold(ctx({ limit: 84 }), 4200)).toMatchObject({ toOwner: false });
  });

  it("[P2-02] refuses no gold, over the cap and no programme", () => {
    expect(previewGold(ctx(), 40)).toEqual({ kind: "no-gold" });
    expect(previewGold(ctx(), 50_001)).toEqual({ kind: "over-cap" });
    expect(previewGold(ctx({ cap: { pence: 50_000, gold: 80 } }), 4200)).toEqual({
      kind: "over-cap",
    });
    expect(previewGold(ctx({ versions: [] }), 4200)).toEqual({ kind: "no-programme" });
  });
});
