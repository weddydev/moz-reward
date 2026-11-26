import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type Points, pence, points } from "@/lib/brand";

import {
  type Award,
  type MemberState,
  type Multiplier,
  applyAward,
  applyReversal,
  calculateAward,
  computeExpiry,
  estimateVisitsToNext,
  initialMemberState,
  leftForfeitAt,
  planExpiry,
  type SentExpiryWarning,
} from "./engine";
import type { MilestonePercent, ProgrammeRules, ProgrammeVersion } from "./programme";

// Mon 5 Jan 2026, 10:00 GMT.
const T0 = new Date("2026-01-05T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const after = (days: number, from: Date = T0): Date => new Date(from.getTime() + days * DAY);

const rules = (over: Partial<ProgrammeRules> = {}): ProgrammeRules => ({
  earnMode: "per_visit",
  earnRate: 100,
  ingotSize: 1_000,
  mainReward: { text: "Free coffee" },
  milestones: [
    { percent: 25, reward: "Biscuit", isMystery: false },
    { percent: 50, reward: "Pastry", isMystery: false },
    { percent: 75, reward: "Mystery treat", isMystery: true },
  ],
  streak: { bonusGold: 50 },
  tiers: { silver: 2, gold: 5 },
  expiryMonths: 12,
  ...over,
});

const version = (
  n: number,
  r: ProgrammeRules,
  activeFrom: Date,
  rewardsFrom: Date = activeFrom,
): ProgrammeVersion => ({
  ...r,
  id: `v${String(n)}`,
  version: n,
  activeFrom,
  rewardsFrom,
  createdAt: activeFrom,
});

const V1 = [version(1, rules(), T0)];

const state = (over: Partial<MemberState> = {}): MemberState => ({
  ...initialMemberState(T0),
  ...over,
});

/** A plain award of `gold` (no streak change), as `calculateAward` would return it. */
const award = (gold: number, over: Partial<Award> = {}): Award => ({
  version: 1,
  base: points(gold),
  multipliers: [],
  earned: points(gold),
  streakBonus: points(0),
  total: points(gold),
  streak: { weeks: 0, lastWeekStart: null },
  ...over,
});

const visit = (
  versions: readonly ProgrammeVersion[],
  requestedAt: Date,
  over: {
    amountPence?: number | null;
    multipliers?: Multiplier[];
    streak?: MemberState["streak"];
  } = {},
): Award =>
  calculateAward({
    versions,
    amountPence: over.amountPence == null ? null : pence(over.amountPence),
    requestedAt,
    multipliers: over.multipliers ?? [],
    streak: over.streak ?? { weeks: 0, lastWeekStart: null },
  });

const HAPPY_HOUR: Multiplier = { source: "happy_hour", percent: 150 };
const DOUBLE: Multiplier = { source: "promo", percent: 200 };

describe("[P1-06] calculateAward: earning", () => {
  it("per-visit earns the rate whatever the amount, including no amount and £0", () => {
    expect(visit(V1, T0).total).toBe(100);
    expect(visit(V1, T0, { amountPence: 0 }).total).toBe(100);
    expect(visit(V1, T0, { amountPence: 12_345 }).total).toBe(100);
  });

  it("per-pound earns floor(pence / 100 × rate)", () => {
    const perPound = [version(1, rules({ earnMode: "per_pound", earnRate: 10 }), T0)];
    expect(visit(perPound, T0, { amountPence: 450 }).total).toBe(45);
    expect(visit(perPound, T0, { amountPence: 459 }).total).toBe(45);
    expect(visit(perPound, T0, { amountPence: 9 }).total).toBe(0);
    expect(visit(perPound, T0, { amountPence: 0 }).total).toBe(0);
    const onePerPound = [version(1, rules({ earnMode: "per_pound", earnRate: 1 }), T0)];
    expect(visit(onePerPound, T0, { amountPence: 999 }).total).toBe(9);
    expect(visit(onePerPound, T0, { amountPence: 99 }).total).toBe(0);
  });

  it("per-pound without an amount is refused (the server always asks for one)", () => {
    const perPound = [version(1, rules({ earnMode: "per_pound", earnRate: 10 }), T0)];
    expect(() => visit(perPound, T0)).toThrow(RangeError);
  });

  it("stacks multipliers by multiplying them: 1.5 × 2 on 7 gold is 21", () => {
    const seven = [version(1, rules({ earnRate: 7 }), T0)];
    const a = visit(seven, T0, { multipliers: [HAPPY_HOUR, DOUBLE] });
    expect(a).toMatchObject({ base: 7, earned: 21, total: 21 });
    expect(a.multipliers).toEqual([HAPPY_HOUR, DOUBLE]);
  });

  it("rounds down to whole gold once, after stacking", () => {
    const seven = [version(1, rules({ earnRate: 7 }), T0)];
    expect(visit(seven, T0, { multipliers: [HAPPY_HOUR] }).earned).toBe(10); // 10.5
    expect(visit(seven, T0, { multipliers: [HAPPY_HOUR, HAPPY_HOUR] }).earned).toBe(15); // 15.75
    // £3.33 at 3 gold per £1 = 9.99, × 1.5 = 14.985 → 14 (flooring first would give 13).
    const perPound = [version(1, rules({ earnMode: "per_pound", earnRate: 3 }), T0)];
    const a = visit(perPound, T0, { amountPence: 333, multipliers: [HAPPY_HOUR] });
    expect(a).toMatchObject({ base: 9, earned: 14 });
  });

  it("refuses a multiplier that is not a whole percent from 100 to 1000", () => {
    for (const percent of [99, 150.5, 1_001, Number.NaN]) {
      expect(
        () => visit(V1, T0, { multipliers: [{ source: "x", percent }] }),
        String(percent),
      ).toThrow(RangeError);
    }
    expect(visit(V1, T0, { multipliers: [{ source: "x", percent: 100 }] }).total).toBe(100);
  });

  it("uses the earn rules of the version active at requestedAt, not at approval", () => {
    const versions = [
      version(1, rules({ earnRate: 100 }), T0),
      version(2, rules({ earnRate: 300 }), after(1)),
    ];
    const justBefore = new Date(after(1).getTime() - 1);
    expect(visit(versions, justBefore)).toMatchObject({ version: 1, total: 100 });
    expect(visit(versions, after(1)).total).toBe(300);
  });

  it("refuses to calculate without a programme", () => {
    expect(() => visit([], T0)).toThrow(RangeError);
  });
});

describe("[P1-06] calculateAward: streaks (ISO weeks, Europe/London)", () => {
  const MON_WEEK1 = new Date("2026-01-05T10:00:00Z");
  const WED_WEEK1 = new Date("2026-01-07T10:00:00Z");
  const MON_WEEK2 = new Date("2026-01-12T10:00:00Z");
  const MON_WEEK3 = new Date("2026-01-19T10:00:00Z");
  const MON_WEEK5 = new Date("2026-02-02T10:00:00Z");

  it("starts a streak at 1 week on the first visit, with no bonus", () => {
    const a = visit(V1, MON_WEEK1);
    expect(a.streak).toEqual({ weeks: 1, lastWeekStart: "2026-01-05" });
    expect(a.streakBonus).toBe(0);
  });

  it("a second visit in the same week changes nothing and pays no bonus", () => {
    const a = visit(V1, WED_WEEK1, { streak: { weeks: 1, lastWeekStart: "2026-01-05" } });
    expect(a.streak).toEqual({ weeks: 1, lastWeekStart: "2026-01-05" });
    expect(a).toMatchObject({ streakBonus: 0, total: 100 });
  });

  it("the first visit of the next week extends the streak to 2 and pays the bonus", () => {
    const a = visit(V1, MON_WEEK2, { streak: { weeks: 1, lastWeekStart: "2026-01-05" } });
    expect(a.streak).toEqual({ weeks: 2, lastWeekStart: "2026-01-12" });
    expect(a).toMatchObject({ earned: 100, streakBonus: 50, total: 150 });
  });

  it("keeps paying the bonus each week the streak continues", () => {
    const a = visit(V1, MON_WEEK3, { streak: { weeks: 2, lastWeekStart: "2026-01-12" } });
    expect(a.streak.weeks).toBe(3);
    expect(a.streakBonus).toBe(50);
  });

  it("a missed week restarts the streak at 1 with no bonus", () => {
    const a = visit(V1, MON_WEEK5, { streak: { weeks: 3, lastWeekStart: "2026-01-19" } });
    expect(a.streak).toEqual({ weeks: 1, lastWeekStart: "2026-02-02" });
    expect(a.streakBonus).toBe(0);
  });

  it("judges the week change on UK time across the spring and autumn clock changes", () => {
    // Sun 29 Mar 2026 23:30 UTC is already Mon 30 Mar 00:30 BST: a new week, so the streak extends.
    const bst = visit(V1, new Date("2026-03-29T23:30:00Z"), {
      streak: { weeks: 1, lastWeekStart: "2026-03-23" },
    });
    expect(bst.streak).toEqual({ weeks: 2, lastWeekStart: "2026-03-30" });
    expect(bst.streakBonus).toBe(50);
    // Sun 25 Oct 2026 23:30 UTC is still Sunday 23:30 GMT: the same week, no bonus.
    const gmt = visit(V1, new Date("2026-10-25T23:30:00Z"), {
      streak: { weeks: 1, lastWeekStart: "2026-10-19" },
    });
    expect(gmt.streak).toEqual({ weeks: 1, lastWeekStart: "2026-10-19" });
    expect(gmt.streakBonus).toBe(0);
  });

  it("tracks the streak but pays nothing when the shop has streaks off", () => {
    const off = [version(1, rules({ streak: null }), T0)];
    const a = visit(off, MON_WEEK2, { streak: { weeks: 1, lastWeekStart: "2026-01-05" } });
    expect(a.streak.weeks).toBe(2);
    expect(a.streakBonus).toBe(0);
  });

  it("a visit from an earlier week than the last one (approved late) leaves the streak alone", () => {
    const a = visit(V1, MON_WEEK1, { streak: { weeks: 2, lastWeekStart: "2026-01-12" } });
    expect(a.streak).toEqual({ weeks: 2, lastWeekStart: "2026-01-12" });
    expect(a.streakBonus).toBe(0);
  });

  it("does not multiply the streak bonus", () => {
    const a = visit(V1, MON_WEEK2, {
      streak: { weeks: 1, lastWeekStart: "2026-01-05" },
      multipliers: [DOUBLE],
    });
    expect(a).toMatchObject({ earned: 200, streakBonus: 50, total: 250 });
  });
});

describe("[P1-06] applyAward: progress, ingots and milestones", () => {
  it("adds gold to the current ingot and unlocks the milestones it passes", () => {
    const out = applyAward(state(), award(300), V1, T0);
    expect(out.state.progress).toBe(300);
    expect(out.state.ingotsCompleted).toBe(0);
    expect(out.milestones.map((m) => m.percent)).toEqual([25]);
    expect(out.milestones[0]).toMatchObject({
      ingotNumber: 1,
      reward: "Biscuit",
      isMystery: false,
    });
    expect(out.ingots).toEqual([]);
  });

  it("an award that exactly fills the ingot completes it with no overflow", () => {
    const out = applyAward(
      state({ progress: points(900), milestonesReached: [25, 50, 75] }),
      award(100),
      V1,
      T0,
    );
    expect(out.state).toMatchObject({ progress: 0, ingotsCompleted: 1, milestonesReached: [] });
    expect(out.ingots).toEqual([
      {
        ingotNumber: 1,
        ingotSize: 1_000,
        mainReward: { text: "Free coffee" },
        sizeVersion: 1,
        rewardsVersion: 1,
      },
    ]);
    expect(out.milestones).toEqual([]);
  });

  it("an award can fill two ingots and carries the overflow into the next", () => {
    const at = after(3);
    const out = applyAward(state({ progress: points(800) }), award(1_450), V1, at);
    expect(out.ingots.map((i) => i.ingotNumber)).toEqual([1, 2]);
    expect(out.state).toMatchObject({ progress: 250, ingotsCompleted: 2, ingotStartedAt: at });
    // Ingot 1 had no milestones recorded yet: 25/50/75 unlock on the way to 100%; ingot 2 is filled whole
    // (its three too), and the overflow of 250 reaches 25% of ingot 3.
    expect(out.milestones.map((m) => `${String(m.ingotNumber)}:${String(m.percent)}`)).toEqual([
      "1:25",
      "1:50",
      "1:75",
      "2:25",
      "2:50",
      "2:75",
      "3:25",
    ]);
    expect(out.state.milestonesReached).toEqual([25]);
  });

  it("never unlocks a milestone twice within an ingot", () => {
    const first = applyAward(state(), award(260), V1, T0);
    const second = applyAward(first.state, award(10), V1, T0);
    expect(first.milestones.map((m) => m.percent)).toEqual([25]);
    expect(second.milestones).toEqual([]);
    // A reversal below 25% and a climb back does not unlock it again either.
    const reversed = applyReversal(second.state, points(200)).state;
    expect(applyAward(reversed, award(200), V1, T0).milestones).toEqual([]);
  });

  it("repeats milestones in every ingot (default — client to confirm)", () => {
    const filled = applyAward(
      state({ progress: points(990), milestonesReached: [25, 50, 75] }),
      award(10),
      V1,
      T0,
    );
    const next = applyAward(filled.state, award(250), V1, T0);
    expect(next.milestones).toEqual([
      { ingotNumber: 2, percent: 25, reward: "Biscuit", isMystery: false, rewardsVersion: 1 },
    ]);
  });

  it("offsets a recorded shortfall before anything counts as progress", () => {
    const owed = state({ progress: points(100), shortfall: points(300) });
    const small = applyAward(owed, award(100), V1, T0);
    expect(small.state).toMatchObject({ progress: 100, shortfall: 200 });
    expect(small.shortfallOffset).toBe(100);
    const big = applyAward(small.state, award(500), V1, T0);
    expect(big.state).toMatchObject({ progress: 400, shortfall: 0 });
    expect(big.shortfallOffset).toBe(200);
    expect(big.milestones.map((m) => m.percent)).toEqual([25]);
  });

  it("a zero-gold award changes only the streak", () => {
    const before = state({ progress: points(500), milestonesReached: [25, 50] });
    const streak = { weeks: 1, lastWeekStart: "2026-01-05" };
    const out = applyAward(before, award(0, { streak }), V1, T0);
    expect(out.state).toEqual({ ...before, streak });
    expect(out.ingots).toEqual([]);
    expect(out.milestones).toEqual([]);
  });

  it("raises the tier when a multi-ingot award crosses a threshold, and never lowers it", () => {
    const small = [version(1, rules({ ingotSize: 100 }), T0)];
    const silver = applyAward(state({ ingotsCompleted: 1 }), award(250), small, T0);
    expect(silver.state).toMatchObject({ ingotsCompleted: 3, tier: "silver" });
    expect(silver.tierRaised).toBe(true);
    const gold = applyAward(silver.state, award(300), small, T0);
    expect(gold.state).toMatchObject({ ingotsCompleted: 6, tier: "gold" });
    // The shop raises the thresholds later: the member keeps Gold.
    const stricter = [
      ...small,
      version(2, rules({ ingotSize: 100, tiers: { silver: 10, gold: 20 } }), after(1)),
    ];
    const kept = applyAward(gold.state, award(100), stricter, after(2));
    expect(kept.state.tier).toBe("gold");
    expect(kept.tierRaised).toBe(false);
  });
});

describe("[P1-06] applyAward: programme versions", () => {
  const big = rules({ ingotSize: 1_000 });
  const half = rules({ ingotSize: 500 });

  it("an ingot-size change applies from the next ingot; one award from full still fills under the old size", () => {
    const versions = [version(1, big, T0), version(2, half, after(1))];
    const nearlyFull = state({ progress: points(900), milestonesReached: [25, 50, 75] });
    const out = applyAward(nearlyFull, award(100), versions, after(2));
    expect(out.ingots).toEqual([expect.objectContaining({ ingotSize: 1_000, sizeVersion: 1 })]);
    // The next ingot started after version 2: it is 500 gold.
    const next = applyAward(out.state, award(500), versions, after(3));
    expect(next.ingots).toEqual([
      expect.objectContaining({ ingotNumber: 2, ingotSize: 500, sizeVersion: 2 }),
    ]);
  });

  it("version change between request and approval: earn from requestedAt, ingot terms from the ingot's start", () => {
    const versions = [
      version(1, big, T0),
      version(2, rules({ earnRate: 300, ingotSize: 2_000 }), after(1)),
    ];
    const requestedAt = new Date(after(1).getTime() - 60_000);
    const approvedAt = after(1);
    const a = visit(versions, requestedAt);
    expect(a.total).toBe(100); // version 1's rate
    const out = applyAward(state({ progress: points(950) }), a, versions, approvedAt);
    expect(out.ingots).toEqual([expect.objectContaining({ ingotSize: 1_000, sizeVersion: 1 })]); // ingot began under v1
    expect(out.state.progress).toBe(50);
  });

  it("a reward change reaches an ingot only if the ingot starts after the 14-day notice", () => {
    const notice = after(15);
    const versions = [
      version(1, big, T0),
      version(2, rules({ mainReward: { text: "Free cake" } }), after(1), notice),
    ];
    const oldIngot = applyAward(state(), award(1_000), versions, after(5));
    expect(oldIngot.ingots[0]?.mainReward.text).toBe("Free coffee");
    // Ingot 2 started at day 5, inside the notice window: still the old reward.
    const stillOld = applyAward(oldIngot.state, award(1_000), versions, after(20));
    expect(stillOld.ingots[0]?.mainReward.text).toBe("Free coffee");
    // Ingot 3 started at day 20, after the notice: the new reward.
    const fresh = applyAward(stillOld.state, award(1_000), versions, after(21));
    expect(fresh.ingots[0]).toMatchObject({ mainReward: { text: "Free cake" }, rewardsVersion: 2 });
  });

  it("refuses to apply an award without a programme", () => {
    expect(() => applyAward(state(), award(10), [], T0)).toThrow(RangeError);
  });
});

describe("[P1-06] applyReversal", () => {
  it("reduces current-ingot progress only", () => {
    const before = state({
      progress: points(600),
      ingotsCompleted: 2,
      milestonesReached: [25, 50],
      tier: "silver",
    });
    const out = applyReversal(before, points(200));
    expect(out.state).toEqual({ ...before, progress: 400 });
    expect(out).toMatchObject({ fromProgress: 200, toShortfall: 0 });
  });

  it("a reversal larger than progress floors at 0 and records the rest as a shortfall", () => {
    const before = state({
      progress: points(150),
      ingotsCompleted: 3,
      milestonesReached: [25],
      shortfall: points(20),
    });
    const out = applyReversal(before, points(400));
    expect(out.state).toMatchObject({
      progress: 0,
      shortfall: 270,
      ingotsCompleted: 3,
      milestonesReached: [25],
    });
    expect(out).toMatchObject({ fromProgress: 150, toShortfall: 250 });
  });

  it("an earn after a shortfall pays the shortfall off first", () => {
    const reversed = applyReversal(state({ progress: points(100) }), points(300)).state;
    const out = applyAward(reversed, award(250), V1, T0);
    expect(out.state).toMatchObject({ progress: 50, shortfall: 0 });
    expect(out.shortfallOffset).toBe(200);
  });

  it("a reversal of 0 changes nothing", () => {
    const before = state({ progress: points(10) });
    expect(applyReversal(before, points(0)).state).toEqual(before);
  });
});

describe("[P1-06] estimateVisitsToNext", () => {
  it("divides what is left by the average recent award, rounding up", () => {
    const s = state({ progress: points(700) });
    expect(estimateVisitsToNext(s, [points(100), points(100)], V1)).toBe(3);
    expect(estimateVisitsToNext(s, [points(100), points(200)], V1)).toBe(2);
    expect(estimateVisitsToNext(s, [points(300)], V1)).toBe(1); // the Wallet's "1 more visit"
  });

  it("counts a shortfall as gold still to earn", () => {
    expect(
      estimateVisitsToNext(
        state({ progress: points(900), shortfall: points(100) }),
        [points(100)],
        V1,
      ),
    ).toBe(2);
  });

  it("uses only the last 10 awards", () => {
    const history = [
      ...Array.from({ length: 10 }, () => points(1)),
      ...Array.from({ length: 10 }, () => points(100)),
    ];
    expect(estimateVisitsToNext(state(), history, V1)).toBe(10);
  });

  it("has no estimate without history or when recent awards were all zero", () => {
    expect(estimateVisitsToNext(state(), [], V1)).toBeNull();
    expect(estimateVisitsToNext(state(), [points(0), points(0)], V1)).toBeNull();
  });

  it("refuses to estimate without a programme", () => {
    expect(() => estimateVisitsToNext(state(), [points(10)], [])).toThrow(RangeError);
  });
});

describe("[P1-06] computeExpiry (rolling, from the last approved visit)", () => {
  const lastVisit = new Date("2026-03-10T14:30:00Z"); // 14:30 GMT
  const expiresAt = new Date("2027-03-10T14:30:00Z"); // 12 London months later (GMT again)
  const withGold = state({
    progress: points(400),
    ingotsCompleted: 2,
    milestonesReached: [25],
    tier: "silver",
    shortfall: points(5),
  });

  it("is off when the programme has no expiry", () => {
    const off = [version(1, rules({ expiryMonths: null }), T0)];
    expect(computeExpiry(withGold, off, lastVisit, after(1_000))).toEqual({ kind: "off" });
  });

  it("has nothing to expire without current-ingot gold or without an approved visit", () => {
    expect(computeExpiry(state(), V1, lastVisit, after(1_000))).toEqual({ kind: "nothing" });
    expect(computeExpiry(withGold, V1, null, after(1_000))).toEqual({ kind: "nothing" });
  });

  it("schedules expiry 12 London months after the last visit, with warnings 30 and 7 days before", () => {
    const out = computeExpiry(withGold, V1, lastVisit, new Date("2026-06-01T00:00:00Z"));
    expect(out).toEqual({
      kind: "scheduled",
      expiresAt,
      gold: 400,
      warnings: [
        { daysBefore: 30, at: new Date("2027-02-08T14:30:00Z") },
        { daysBefore: 7, at: new Date("2027-03-03T14:30:00Z") },
      ],
    });
  });

  it("keeps the London wall time when a warning falls on the other side of a clock change", () => {
    const summerVisit = new Date("2026-04-20T09:00:00Z"); // 10:00 BST
    const out = computeExpiry(withGold, V1, summerVisit, summerVisit);
    expect(out.kind === "scheduled" && out.expiresAt.toISOString()).toBe(
      "2027-04-20T09:00:00.000Z",
    );
    // 30 days before is 21 Mar 2027, before the clock change: 10:00 GMT.
    expect(out.kind === "scheduled" && out.warnings[0]?.at.toISOString()).toBe(
      "2027-03-21T10:00:00.000Z",
    );
  });

  it("is still only scheduled a moment before expiry", () => {
    expect(computeExpiry(withGold, V1, lastVisit, new Date(expiresAt.getTime() - 1)).kind).toBe(
      "scheduled",
    );
  });

  it("when due removes only current-ingot progress; ingots, milestones, tier and shortfall stay", () => {
    const out = computeExpiry(withGold, V1, lastVisit, expiresAt);
    expect(out).toEqual({ kind: "due", expiresAt, gold: 400, state: { ...withGold, progress: 0 } });
  });

  it("uses the expiry setting of the version in force now", () => {
    const lengthened = new Date("2027-04-01T00:00:00Z");
    const versions = [
      version(1, rules({ expiryMonths: 12 }), T0),
      version(2, rules({ expiryMonths: 24 }), lengthened),
    ];
    // At the 12-month date version 1 is still in force: due.
    expect(computeExpiry(withGold, versions, lastVisit, expiresAt).kind).toBe("due");
    // Once the shop moved to 24 months, the same gold (if the job hadn't run) is measured by the new rule.
    expect(computeExpiry(withGold, versions, lastVisit, lengthened)).toMatchObject({
      kind: "scheduled",
      expiresAt: new Date("2028-03-10T14:30:00Z"),
    });
  });

  it("is off without a programme", () => {
    expect(computeExpiry(withGold, [], lastVisit, T0)).toEqual({ kind: "off" });
  });
});

describe("[P1-13] planExpiry (daily job: warnings 30 and 7 days before, each once, then expiry)", () => {
  const lastVisit = new Date("2026-03-10T14:30:00Z");
  const E = new Date("2027-03-10T14:30:00Z"); // 12 London months later
  const W30 = new Date("2027-02-08T14:30:00Z");
  const W7 = new Date("2027-03-03T14:30:00Z");
  const withGold = state({
    progress: points(400),
    ingotsCompleted: 2,
    milestonesReached: [25],
    tier: "silver",
    shortfall: points(5),
  });
  const sent = (daysBefore: 30 | 7, sentAt: Date, expiresAt: Date = E): SentExpiryWarning => ({
    expiresAt,
    daysBefore,
    sentAt,
  });
  const plan = (now: Date, warnings: SentExpiryWarning[] = [], visit: Date | null = lastVisit) =>
    planExpiry(withGold, V1, visit, now, warnings);

  it("passes off and nothing through (no expiry setting, no gold, no visit)", () => {
    const off = [version(1, rules({ expiryMonths: null }), T0)];
    expect(planExpiry(withGold, off, lastVisit, E, [sent(30, W30), sent(7, W7)])).toEqual({
      kind: "off",
    });
    expect(planExpiry(state(), V1, lastVisit, E, [])).toEqual({ kind: "nothing" });
    expect(plan(E, [], null)).toEqual({ kind: "nothing" });
  });

  it("waits until 30 days before, then warns 30 days before with the real date", () => {
    expect(plan(new Date(W30.getTime() - 1))).toEqual({ kind: "wait", expiresAt: E, gold: 400 });
    expect(plan(W30)).toEqual({
      kind: "warn",
      daysBefore: 30,
      nominalExpiresAt: E,
      expiresAt: E,
      gold: 400,
    });
  });

  it("after the 30-day warning: waits, then warns 7 days before, then expires on the date", () => {
    expect(plan(new Date(W7.getTime() - 1), [sent(30, W30)])).toMatchObject({ kind: "wait" });
    expect(plan(W7, [sent(30, W30)])).toEqual({
      kind: "warn",
      daysBefore: 7,
      nominalExpiresAt: E,
      expiresAt: E,
      gold: 400,
    });
    const both = [sent(30, W30), sent(7, W7)];
    expect(plan(new Date(E.getTime() - 1), both)).toEqual({
      kind: "wait",
      expiresAt: E,
      gold: 400,
    });
    expect(plan(E, both)).toEqual({
      kind: "due",
      nominalExpiresAt: E,
      gold: 400,
      state: { ...withGold, progress: 0 },
    });
  });

  it("never expires more than current-ingot progress: ingots, milestones, tier and shortfall stay", () => {
    const out = plan(E, [sent(30, W30), sent(7, W7)]);
    expect(out.kind === "due" && out.state).toEqual({ ...withGold, progress: 0 });
  });

  it("a member never gets both warnings in one run, and never loses gold without both notices", () => {
    // The job (or the shop's switch-on) first reaches this member long after the nominal date.
    const late = new Date("2027-06-01T08:00:00Z"); // 09:00 BST
    const first = plan(late);
    expect(first).toEqual({
      kind: "warn",
      daysBefore: 30,
      nominalExpiresAt: E,
      expiresAt: new Date("2027-07-01T08:00:00Z"),
      gold: 400,
    });
    const s30 = [sent(30, late)];
    expect(plan(new Date("2027-06-24T07:59:59Z"), s30)).toMatchObject({ kind: "wait" });
    expect(plan(new Date("2027-06-24T08:00:00Z"), s30)).toMatchObject({
      kind: "warn",
      daysBefore: 7,
      expiresAt: new Date("2027-07-01T08:00:00Z"),
    });
    const s7 = [...s30, sent(7, new Date("2027-06-24T08:00:00Z"))];
    expect(plan(new Date("2027-07-01T07:59:59Z"), s7)).toMatchObject({ kind: "wait" });
    expect(plan(new Date("2027-07-01T08:00:00Z"), s7)).toMatchObject({ kind: "due", gold: 400 });
  });

  it("a 7-day warning sent late pushes the expiry to 7 days after it", () => {
    const late7 = new Date("2027-03-08T03:00:00Z");
    const out = plan(E, [sent(30, W30), sent(7, late7)]);
    expect(out).toEqual({ kind: "wait", expiresAt: new Date("2027-03-15T03:00:00Z"), gold: 400 });
    expect(plan(new Date("2027-03-15T03:00:00Z"), [sent(30, W30), sent(7, late7)]).kind).toBe(
      "due",
    );
  });

  it("an approved visit after a warning resets the clock: old warnings don't count, no expiry follows", () => {
    const visit = new Date("2027-03-05T12:00:00Z");
    const both = [sent(30, W30), sent(7, W7)];
    expect(plan(E, both, visit)).toEqual({
      kind: "wait",
      expiresAt: new Date("2028-03-05T12:00:00Z"),
      gold: 400,
    });
  });

  it("a shop that turns expiry off after a warning: no expiry", () => {
    const versions = [
      version(1, rules({ expiryMonths: 12 }), T0),
      version(2, rules({ expiryMonths: null }), new Date("2027-02-20T00:00:00Z")),
    ];
    expect(planExpiry(withGold, versions, lastVisit, E, [sent(30, W30), sent(7, W7)])).toEqual({
      kind: "off",
    });
  });

  it("a membership with a shortfall and no current gold has nothing to expire", () => {
    const owing = state({ progress: points(0), shortfall: points(120) });
    expect(planExpiry(owing, V1, lastVisit, E, [])).toEqual({ kind: "nothing" });
  });

  it("month ends: a 29 Feb visit expires on 28 Feb the next year, warnings by London calendar days", () => {
    const leap = new Date("2028-02-29T10:00:00Z");
    const nominal = new Date("2029-02-28T10:00:00Z");
    expect(planExpiry(withGold, V1, leap, new Date("2029-01-29T10:00:00Z"), [])).toMatchObject({
      kind: "warn",
      daysBefore: 30,
      nominalExpiresAt: nominal,
      expiresAt: nominal,
    });
    expect(planExpiry(withGold, V1, leap, new Date("2029-01-29T09:59:59Z"), []).kind).toBe("wait");
  });

  it("DST: a 7-day warning across the spring clock change keeps the London wall time", () => {
    const visit = new Date("2026-04-01T09:00:00Z"); // 10:00 BST
    const nominal = new Date("2027-04-01T09:00:00Z"); // 10:00 BST
    const at7 = new Date("2027-03-25T10:00:00Z"); // 10:00 GMT, before the 28 Mar change
    const s30 = [sent(30, new Date("2027-03-02T10:00:00Z"), nominal)];
    expect(planExpiry(withGold, V1, visit, new Date(at7.getTime() - 1), s30).kind).toBe("wait");
    expect(planExpiry(withGold, V1, visit, at7, s30)).toMatchObject({
      kind: "warn",
      daysBefore: 7,
    });
  });
});

describe("[P1-13] leftForfeitAt (frozen progress: restored through day 30, forfeit on day 31)", () => {
  it("is 00:00 UK time 31 London days after the leave day", () => {
    expect(leftForfeitAt(new Date("2026-11-01T10:00:00Z")).toISOString()).toBe(
      "2026-12-02T00:00:00.000Z",
    );
    expect(leftForfeitAt(new Date("2026-11-01T23:59:59Z")).toISOString()).toBe(
      "2026-12-02T00:00:00.000Z",
    );
  });

  it("uses the London day of the leave (00:30 BST is still that London day), across the autumn change", () => {
    // 00:30 BST on 20 Oct 2026 = 23:30 UTC on 19 Oct.
    expect(leftForfeitAt(new Date("2026-10-19T23:30:00Z")).toISOString()).toBe(
      "2026-11-20T00:00:00.000Z",
    );
  });

  it("lands on 00:00 BST when day 31 is after the spring change", () => {
    expect(leftForfeitAt(new Date("2027-03-01T12:00:00Z")).toISOString()).toBe(
      "2027-03-31T23:00:00.000Z",
    );
  });
});

describe("[P1-06] initialMemberState", () => {
  it("starts empty, Bronze, with the first ingot starting at the join", () => {
    expect(initialMemberState(T0)).toEqual({
      progress: 0,
      ingotsCompleted: 0,
      ingotStartedAt: T0,
      milestonesReached: [],
      shortfall: 0,
      tier: "bronze",
      streak: { weeks: 0, lastWeekStart: null },
    });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property-based tests: invariants over random programmes and random sequences of earns, reversals and
// expiry runs (fast-check shrinks any failure to the smallest sequence).

const percentSet = fc.subarray([25, 50, 75] as MilestonePercent[]);
const programmeArb = fc.record({
  earnMode: fc.constantFrom("per_visit" as const, "per_pound" as const),
  earnRate: fc.integer({ min: 1, max: 500 }),
  ingotSize: fc.integer({ min: 100, max: 5_000 }),
  milestones: percentSet,
  streakBonus: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
  silver: fc.integer({ min: 1, max: 4 }),
  gold: fc.integer({ min: 5, max: 12 }),
  expiryMonths: fc.option(fc.integer({ min: 12, max: 24 }), { nil: null }),
});

type Op =
  | { kind: "earn"; amountPence: number; hours: number; multipliers: Multiplier[] }
  | { kind: "reverse"; gold: number }
  | { kind: "expire"; days: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant("earn" as const),
      amountPence: fc.integer({ min: 0, max: 50_000 }),
      hours: fc.integer({ min: 0, max: 24 * 20 }),
      multipliers: fc.array(
        fc.record({ source: fc.constant("m"), percent: fc.constantFrom(100, 150, 200, 300) }),
        { maxLength: 3 },
      ),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("reverse" as const),
      gold: fc.integer({ min: 0, max: 3_000 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("expire" as const),
      days: fc.integer({ min: 0, max: 800 }),
    }),
  },
);

const TIER_RANK = { bronze: 0, silver: 1, gold: 2 } as const;

/** Plain checks inside the hot loop (an `expect` per step would cost seconds over 300 × 40 steps). */
function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`invariant broken: ${what}`);
}
const sameList = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

describe("[P1-06] loyalty engine properties", () => {
  it("progress never goes negative or reaches the ingot size; gold is conserved; rewards are never revoked", () => {
    fc.assert(
      fc.property(programmeArb, fc.array(opArb, { maxLength: 40 }), (p, ops) => {
        const versions = [
          version(
            1,
            rules({
              earnMode: p.earnMode,
              earnRate: p.earnRate,
              ingotSize: p.ingotSize,
              milestones: p.milestones.map((percent) => ({
                percent,
                reward: `M${String(percent)}`,
                isMystery: false,
              })),
              streak: p.streakBonus === null ? null : { bonusGold: p.streakBonus },
              tiers: { silver: p.silver, gold: p.gold },
              expiryMonths: p.expiryMonths,
            }),
            T0,
          ),
        ];
        let s = initialMemberState(T0);
        let clock = T0;
        let lastVisit: Date | null = null;
        let ledger = 0; // every gold movement: + earns, − reversals, − expiries
        let filledGold = 0;
        const unlockedMilestones = new Set<string>();

        for (const op of ops) {
          const before = s;
          if (op.kind === "earn") {
            clock = new Date(clock.getTime() + op.hours * 3_600_000);
            const a = calculateAward({
              versions,
              amountPence: pence(op.amountPence),
              requestedAt: clock,
              multipliers: op.multipliers,
              streak: s.streak,
            });
            check(a.earned >= a.base, "multipliers never reduce gold");
            const out = applyAward(s, a, versions, clock);
            ledger += a.total;
            for (const ingot of out.ingots) filledGold += ingot.ingotSize;
            for (const m of out.milestones) {
              const key = `${String(m.ingotNumber)}:${String(m.percent)}`;
              check(!unlockedMilestones.has(key), `milestone ${key} unlocked twice`);
              unlockedMilestones.add(key);
            }
            check(
              out.state.ingotsCompleted === before.ingotsCompleted + out.ingots.length,
              "ingot count",
            );
            s = out.state;
            lastVisit = clock;
          } else if (op.kind === "reverse") {
            const out = applyReversal(s, points(op.gold));
            check(out.fromProgress + out.toShortfall === op.gold, "reversal split");
            ledger -= op.gold;
            s = out.state;
            check(sameList(s.milestonesReached, before.milestonesReached), "milestones kept");
          } else {
            clock = new Date(clock.getTime() + op.days * DAY);
            const e = computeExpiry(s, versions, lastVisit, clock);
            if (e.kind === "due") {
              check(e.gold === before.progress, "expiry removes the progress");
              ledger -= e.gold;
              s = e.state;
              check(sameList(s.milestonesReached, before.milestonesReached), "milestones kept");
            }
          }
          // Invariants after every step.
          check(s.progress >= 0, "progress ≥ 0");
          check(s.progress < p.ingotSize, "progress < ingot size");
          check(s.shortfall >= 0, "shortfall ≥ 0");
          check(ledger === filledGold + s.progress - s.shortfall, "gold conserved");
          check(s.ingotsCompleted >= before.ingotsCompleted, "ingots never removed");
          check(TIER_RANK[s.tier] >= TIER_RANK[before.tier], "tier never lowered");
          if (op.kind !== "earn") {
            check(s.ingotsCompleted === before.ingotsCompleted, "reversal/expiry keep ingots");
            check(s.tier === before.tier, "reversal/expiry keep the tier");
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("is deterministic: the same inputs give the same award and the same new state", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 2_000 }),
        fc.date({
          min: new Date("2026-01-01T00:00:00Z"),
          max: new Date("2030-01-01T00:00:00Z"),
          noInvalidDate: true,
        }),
        (amount, progress, at) => {
          const versions = [
            version(1, rules({ earnMode: "per_pound", earnRate: 7, ingotSize: 2_500 }), T0),
          ];
          const input = {
            versions,
            amountPence: pence(amount),
            requestedAt: at,
            multipliers: [HAPPY_HOUR],
            streak: { weeks: 1, lastWeekStart: "2025-12-29" },
          };
          const s = state({ progress: points(progress) });
          expect(calculateAward(input)).toEqual(calculateAward(input));
          const a = calculateAward(input);
          expect(applyAward(s, a, versions, at)).toEqual(applyAward(s, a, versions, at));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("per-pound earning is monotonic in the amount and never more than the exact value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100 }),
        (amount, rate) => {
          const versions = [version(1, rules({ earnMode: "per_pound", earnRate: rate }), T0)];
          const at = (n: number): Points => visit(versions, T0, { amountPence: n }).earned;
          expect(at(amount + 1)).toBeGreaterThanOrEqual(at(amount));
          expect(at(amount) * 100).toBeLessThanOrEqual(amount * rate);
          expect((at(amount) + 1) * 100).toBeGreaterThan(amount * rate);
        },
      ),
      { numRuns: 300 },
    );
  });
});
