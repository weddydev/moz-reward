import { describe, expect, it } from "vitest";
import {
  describeChanges,
  ingotTerms,
  LIMITS,
  pendingRewardChanges,
  type ProgrammeRules,
  type ProgrammeVersion,
  REWARD_NOTICE_DAYS,
  rewardsFromFor,
  rewardsVersionAt,
  rulesOf,
  sameRewards,
  sameRules,
  TEMPLATE_IDS,
  TEMPLATES,
  versionActiveAt,
  visitsPerIngot,
} from "./programme";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-11-02T10:00:00Z");
const day = (n: number): Date => new Date(T0.getTime() + n * DAY);

const BASE: ProgrammeRules = TEMPLATES.cafe.rules;

let seq = 0;
function v(
  version: number,
  rules: Partial<ProgrammeRules>,
  saved: Date,
  rewardsFrom = saved,
): ProgrammeVersion {
  seq += 1;
  return {
    ...BASE,
    ...rules,
    id: `id-${String(seq)}`,
    version,
    activeFrom: saved,
    rewardsFrom,
    createdAt: saved,
  };
}

/** Appends a version the way the save service does (rewardsFrom from the rule under test). */
function save(
  history: ProgrammeVersion[],
  rules: Partial<ProgrammeRules>,
  now: Date,
): ProgrammeVersion[] {
  const next = { ...BASE, ...(history.at(-1) ?? {}), ...rules };
  const rf = rewardsFromFor(history, next, now);
  return [...history, v(history.length + 1, next, now, rf)];
}

describe("[P1-05] templates", () => {
  it("every template is within the field limits", () => {
    for (const id of TEMPLATE_IDS) {
      const r = TEMPLATES[id].rules;
      const rate = LIMITS.earnRate[r.earnMode];
      expect(r.earnRate).toBeGreaterThanOrEqual(rate.min);
      expect(r.earnRate).toBeLessThanOrEqual(rate.max);
      expect(r.ingotSize).toBeGreaterThanOrEqual(LIMITS.ingotSize.min);
      expect(r.milestones.length).toBeLessThanOrEqual(3);
      expect(r.tiers.silver).toBeLessThan(r.tiers.gold);
      if (r.expiryMonths !== null) expect(r.expiryMonths).toBeGreaterThanOrEqual(12);
    }
  });

  it("the four PRODUCT §6 templates exist with their names", () => {
    expect(TEMPLATE_IDS.map((id) => TEMPLATES[id].name)).toEqual([
      "Café classic",
      "Restaurant",
      "Retail",
      "Beauty",
    ]);
  });
});

describe("[P1-05] comparing rules", () => {
  it("milestone order does not matter; content does", () => {
    const a: ProgrammeRules = {
      ...BASE,
      milestones: [
        { percent: 75, reward: "B", isMystery: true },
        { percent: 25, reward: "A", isMystery: false },
      ],
    };
    const b: ProgrammeRules = { ...a, milestones: [...a.milestones].reverse() };
    expect(sameRules(a, b)).toBe(true);
    expect(rulesOf(a).milestones.map((m) => m.percent)).toEqual([25, 75]);
    expect(
      sameRewards(a, { ...a, milestones: [{ percent: 25, reward: "A", isMystery: true }] }),
    ).toBe(false);
  });

  it("an earn-rate change is not a rewards change", () => {
    expect(sameRewards(BASE, { ...BASE, earnRate: 150, ingotSize: 2_000 })).toBe(true);
    expect(sameRules(BASE, { ...BASE, earnRate: 150 })).toBe(false);
  });
});

describe("[P1-05] 14-day notice for reward and milestone changes", () => {
  it("first version: rewards apply at once", () => {
    expect(rewardsFromFor([], BASE, T0)).toEqual(T0);
  });

  it("no rewards change (only the earn rate): at once", () => {
    const h = save([], {}, T0);
    expect(rewardsFromFor(h, { ...BASE, earnRate: 120 }, day(1))).toEqual(day(1));
  });

  it("a reward change applies exactly 14 days after the save", () => {
    const h = save(save([], {}, T0), { mainReward: { text: "Free cake" } }, day(1));
    expect(h[1]?.rewardsFrom).toEqual(day(1 + REWARD_NOTICE_DAYS));
    const justBefore = new Date(day(15).getTime() - 1);
    expect(rewardsVersionAt(h, justBefore)?.mainReward.text).toBe(BASE.mainReward.text);
    expect(rewardsVersionAt(h, day(15))?.mainReward.text).toBe("Free cake");
    // The earn rules of the new version apply at once.
    expect(versionActiveAt(h, day(1))?.version).toBe(2);
  });

  it("a milestone change needs notice too", () => {
    const h = save(save([], {}, T0), { milestones: [] }, day(1));
    expect(h[1]?.rewardsFrom).toEqual(day(15));
  });

  it("two changes inside the window: the later one restarts its own notice", () => {
    let h = save([], {}, T0);
    h = save(h, { mainReward: { text: "Cake" } }, day(1)); // pending until day 15
    h = save(h, { mainReward: { text: "Bun" } }, day(5)); // pending until day 19
    expect(h[2]?.rewardsFrom).toEqual(day(19));
    expect(rewardsVersionAt(h, day(10))?.mainReward.text).toBe(BASE.mainReward.text);
    expect(rewardsVersionAt(h, day(16))?.mainReward.text).toBe("Cake");
    expect(rewardsVersionAt(h, day(19))?.mainReward.text).toBe("Bun");
    expect(pendingRewardChanges(h, day(6)).map((x) => x.version)).toEqual([2, 3]);
  });

  it("edit then revert inside the window: the revert applies at once and cancels the change", () => {
    let h = save([], {}, T0);
    h = save(h, { mainReward: { text: "Cake" } }, day(1));
    h = save(h, { mainReward: { text: BASE.mainReward.text } }, day(3));
    expect(h[2]?.rewardsFrom).toEqual(day(3));
    // Never in force: not at its own date, not later.
    for (const d of [2, 15, 16, 400]) {
      expect(rewardsVersionAt(h, day(d))?.mainReward.text).toBe(BASE.mainReward.text);
    }
    expect(pendingRewardChanges(h, day(4))).toEqual([]);
  });

  it("another field edited while a notice runs keeps the pending date", () => {
    let h = save([], {}, T0);
    h = save(h, { mainReward: { text: "Cake" } }, day(1));
    h = save(h, { earnRate: 150 }, day(4));
    expect(h[2]?.rewardsFrom).toEqual(day(15));
    expect(pendingRewardChanges(h, day(5)).map((x) => x.version)).toEqual([3]);
  });

  it("after the notice ends nothing is pending", () => {
    const h = save(save([], {}, T0), { mainReward: { text: "Cake" } }, day(1));
    expect(pendingRewardChanges(h, day(14)).map((x) => x.version)).toEqual([2]);
    expect(pendingRewardChanges(h, day(15))).toEqual([]);
  });
});

describe("[P1-05] the current ingot completes under the version it started with", () => {
  it("an ingot-size change applies from the next ingot only", () => {
    const h = save(save([], {}, T0), { ingotSize: 2_000 }, day(10));
    // Started before the change, still running after it (one award from full): old size.
    expect(ingotTerms(h, day(3))?.ingotSize).toBe(1_000);
    expect(ingotTerms(h, day(3))?.sizeVersion).toBe(1);
    // The next ingot starts after the change: new size.
    expect(ingotTerms(h, day(11))?.ingotSize).toBe(2_000);
  });

  it("an ingot started before the reward change ends with the old reward, even after the notice", () => {
    const h = save(save([], {}, T0), { mainReward: { text: "Cake" } }, day(1));
    expect(ingotTerms(h, day(2))?.mainReward.text).toBe(BASE.mainReward.text);
    expect(ingotTerms(h, day(2))?.rewardsVersion).toBe(1);
    expect(ingotTerms(h, day(15))?.mainReward.text).toBe("Cake");
  });

  it("an ingot started before the shop's first version uses the first version", () => {
    const h = save([], {}, day(5));
    expect(ingotTerms(h, day(1))?.sizeVersion).toBe(1);
  });

  it("no programme: no terms", () => {
    expect(ingotTerms([], T0)).toBeNull();
  });
});

describe("[P1-05] history lines", () => {
  it("first version", () => {
    expect(describeChanges(null, BASE)).toEqual(["Programme set up"]);
  });

  it("one line per changed setting, UK wording", () => {
    const next: ProgrammeRules = {
      ...BASE,
      earnMode: "per_pound",
      earnRate: 10,
      ingotSize: 2_000,
      streak: null,
      expiryMonths: 12,
      tiers: { silver: 3, gold: 6 },
    };
    expect(describeChanges(BASE, next)).toEqual([
      "Earning: 100 gold per visit → 10 gold per £1 spent",
      "Ingot size: 1,000 gold → 2,000 gold",
      "Streak: 50 gold bonus → off",
      "Tiers: Silver 2, Gold 5 → Silver 3, Gold 6 ingots",
      "Gold expiry: off → 12 months",
    ]);
  });

  it("rewards and milestones, mystery marked", () => {
    const next: ProgrammeRules = {
      ...BASE,
      mainReward: { text: "Cake" },
      milestones: [{ percent: 75, reward: "Surprise", isMystery: true }],
    };
    expect(describeChanges(BASE, next)).toEqual([
      "Main reward: “Free drink of your choice” → “Cake”",
      "Milestones: 50%: Free pastry → 75%: Surprise (mystery)",
    ]);
  });

  it("no change: no lines", () => {
    expect(describeChanges(BASE, { ...BASE })).toEqual([]);
  });
});

describe("[P1-05] visits per ingot", () => {
  it("per visit rounds up; per pound has no fixed count", () => {
    expect(visitsPerIngot({ earnMode: "per_visit", earnRate: 300, ingotSize: 1_000 })).toBe(4);
    expect(visitsPerIngot({ earnMode: "per_pound", earnRate: 10, ingotSize: 1_000 })).toBeNull();
  });
});
