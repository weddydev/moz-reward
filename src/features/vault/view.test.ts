import { describe, expect, it } from "vitest";
import { type ProgrammeVersion, TEMPLATES } from "@/lib/loyalty/programme";
import {
  currentStreakWeeks,
  nextTierText,
  owedText,
  shelfText,
  streakText,
  tierFor,
  type VaultInput,
  vaultGoldText,
  vaultView,
} from "./view";

const NOW = new Date("2026-11-19T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const JOINED = new Date(NOW.getTime() - 30 * DAY);

const version = (over: Partial<ProgrammeVersion> = {}): ProgrammeVersion => ({
  ...TEMPLATES.cafe.rules,
  ingotSize: 1_000,
  mainReward: { text: "Free coffee & cake" },
  milestones: [
    { percent: 25, reward: "Bonus 50 gold", isMystery: false },
    { percent: 50, reward: "Free pastry", isMystery: false },
    { percent: 75, reward: "Secret brownie", isMystery: true },
  ],
  id: "v1",
  version: 1,
  activeFrom: new Date(NOW.getTime() - 60 * DAY),
  rewardsFrom: new Date(NOW.getTime() - 60 * DAY),
  createdAt: new Date(NOW.getTime() - 60 * DAY),
  ...over,
});

const MEMBER: Omit<VaultInput, "progressGold" | "ingotsCompleted" | "versions"> = {
  joinedAt: JOINED,
  ingotStartedAt: null,
  tier: "bronze",
  streakWeeks: 0,
  streakLastWeekStart: null,
  goldShortfall: 0,
};

const view = (
  progressGold: number,
  ingotsCompleted = 0,
  versions = [version()],
  member: Partial<VaultInput> = {},
) => vaultView({ ...MEMBER, progressGold, ingotsCompleted, versions, ...member }, NOW);

describe("[P1-08] Gold Vault view", () => {
  it("is null when the shop has no programme yet", () => {
    expect(view(0, 0, [])).toBeNull();
  });

  it("DESIGN sample: 720 of 1,000 gold, 72%, milestones 25/50 reached, 75 and 100 not", () => {
    const v = view(720, 2);
    expect(v?.ingot.label).toBe("720 of 1,000 gold, 72%");
    expect(v && vaultGoldText(v.ingot)).toBe("720 / 1,000 gold");
    expect(v?.steps.map((s) => [s.percent, s.gold, s.reached, s.main])).toEqual([
      [25, 250, true, false],
      [50, 500, true, false],
      [75, 750, false, false],
      [100, 1_000, false, true],
    ]);
  });

  it("keeps a mystery reward's text on the server until it is reached", () => {
    const before = view(720);
    expect(before?.steps[2]).toMatchObject({ title: "Mystery reward", mystery: true });
    expect(JSON.stringify(before)).not.toContain("Secret brownie");
    expect(view(750)?.steps[2]).toMatchObject({ title: "Secret brownie", reached: true });
  });

  it("progress 0: nothing reached, an empty ingot", () => {
    const v = view(0);
    expect(v?.ingot.fraction).toBe(0);
    expect(v?.steps.every((s) => !s.reached)).toBe(true);
  });

  it("overflow from a multi-ingot award shows the new ingot's progress (counters carry it)", () => {
    // 2,300 gold in one award on a 1,000 ingot: two ingots completed, 300 carried into the third.
    const v = view(300, 2);
    expect(v?.ingot.percent).toBe(30);
    expect(v?.shelf).toEqual({ completed: 2, slots: 5 });
    expect(v?.steps.filter((s) => s.reached).map((s) => s.percent)).toEqual([25]);
  });

  it("uses the ingot size and rewards the current ingot started under, tiers from today's version", () => {
    const later = version({
      id: "v2",
      version: 2,
      ingotSize: 2_000,
      tiers: { silver: 3, gold: 6 },
      activeFrom: new Date(NOW.getTime() - DAY),
      rewardsFrom: new Date(NOW.getTime() - DAY),
    });
    const v = view(720, 2, [version(), later]);
    expect(v?.ingot.size).toBe(1_000); // ingot started (joined) under v1
    expect(v?.tier.name).toBe("Bronze"); // today's thresholds: Silver at 3
    expect(v?.tier.next).toEqual({ name: "Silver", ingotsToGo: 1 });
  });

  it("tiers: Bronze, Silver at 2, Gold at 5 (status only)", () => {
    const t = { silver: 2, gold: 5 };
    expect([0, 1, 2, 4, 5, 40].map((n) => tierFor(n, t))).toEqual([
      "Bronze",
      "Bronze",
      "Silver",
      "Silver",
      "Gold",
      "Gold",
    ]);
    expect(view(0, 5)?.tier).toMatchObject({ name: "Gold", next: null });
    expect(view(0, 3)?.tier.ladder.map((l) => [l.name, l.from, l.current])).toEqual([
      ["Bronze", 0, false],
      ["Silver", 2, true],
      ["Gold", 5, false],
    ]);
    expect(nextTierText({ name: "Silver", ingotsToGo: 1 })).toBe("1 more ingot to Silver");
    expect(nextTierText({ name: "Gold", ingotsToGo: 3 })).toBe("3 more ingots to Gold");
  });

  it("shelf: five slots, or enough for every completed ingot and the one in progress", () => {
    expect(view(0, 0)?.shelf).toEqual({ completed: 0, slots: 5 });
    expect(view(0, 7)?.shelf).toEqual({ completed: 7, slots: 8 });
    expect(shelfText(0, 1_000)).toBe("Your first ingot fills at 1,000 gold.");
    expect(shelfText(1, 1_000)).toBe("1 ingot collected");
    expect(shelfText(2, 1_000)).toBe("2 ingots collected");
  });

  it("streak only when the programme has one", () => {
    expect(view(0)?.streak).toEqual({ bonusGold: 50, weeks: 0 });
    expect(view(0, 0, [version({ streak: null })])?.streak).toBeNull();
  });

  it("[P1-12] the tier shown never drops below the highest stored, even when the owner raises the thresholds (C-66)", () => {
    const raised = version({ tiers: { silver: 4, gold: 8 } });
    // 2 ingots: Bronze under today's thresholds, but the member reached Silver before the owner raised them.
    expect(view(0, 2, [raised], { tier: "silver" })?.tier).toMatchObject({
      name: "Silver",
      next: { name: "Gold", ingotsToGo: 6 },
    });
    expect(view(0, 2, [raised], { tier: "gold" })?.tier).toMatchObject({
      name: "Gold",
      next: null,
    });
    // Earned above the stored tier (thresholds lowered, not yet re-stored): the higher one shows.
    expect(view(0, 5, [version()], { tier: "silver" })?.tier.name).toBe("Gold");
    expect(view(0, 0, [raised], { tier: "bronze" })?.tier.name).toBe("Bronze");
  });

  it("[P1-12] the current ingot's terms are the version in force when it started (C-60)", () => {
    const later = version({
      id: "v2",
      version: 2,
      ingotSize: 2_000,
      activeFrom: new Date(NOW.getTime() - 5 * DAY),
      rewardsFrom: new Date(NOW.getTime() - 5 * DAY),
    });
    expect(view(720, 1, [version(), later])?.ingot.size).toBe(1_000);
    const restarted = { ingotStartedAt: new Date(NOW.getTime() - DAY) };
    expect(view(720, 1, [version(), later], restarted)?.ingot.size).toBe(2_000);
  });

  it("[P1-12] streak: current while its last week is this week or last week, else 0 (C-66)", () => {
    // NOW is Thu 19 Nov 2026: this week starts Mon 16 Nov, last week Mon 9 Nov.
    const at = (weeks: number, last: string | null) =>
      currentStreakWeeks({ streakWeeks: weeks, streakLastWeekStart: last }, NOW);
    expect(at(3, "2026-11-16")).toBe(3);
    expect(at(3, "2026-11-09")).toBe(3);
    expect(at(3, "2026-11-02")).toBe(0);
    expect(at(0, null)).toBe(0);
    expect(at(2, null)).toBe(0);
    expect(
      view(0, 0, [version()], { streakWeeks: 3, streakLastWeekStart: "2026-11-16" })?.streak,
    ).toEqual({
      bonusGold: 50,
      weeks: 3,
    });
    expect(streakText({ bonusGold: 50, weeks: 3 })).toBe("3-week streak · bonus gold active");
    expect(streakText({ bonusGold: 50, weeks: 1 })).toBe(
      "Visit 2 weeks running for +50 bonus gold",
    );
    expect(streakText({ bonusGold: 1_000, weeks: 0 })).toBe(
      "Visit 2 weeks running for +1,000 bonus gold",
    );
  });

  it("how it works follows the programme", () => {
    expect(view(0)?.howItWorks).toEqual({
      earn: "Collect 100 gold on every visit.",
      unlock: "Rewards unlock at 25%, 50%, 75% and 100% of each ingot.",
      tiers: "Fill 2 ingots for Silver and 5 for Gold.",
    });
    const perPound = version({ earnMode: "per_pound", earnRate: 10, milestones: [] });
    expect(view(0, 0, [perPound])?.howItWorks).toMatchObject({
      earn: "Collect 10 gold for every £1 you spend.",
      unlock: "Rewards unlock at 100% of each ingot.",
    });
  });

  it("[PD-11] perVisit: the gold a visit earns under the rules in force now, null when earned per £1", () => {
    expect(view(0)?.perVisit).toBe(100);
    const perPound = version({ earnMode: "per_pound", earnRate: 10, milestones: [] });
    expect(view(0, 0, [perPound])?.perVisit).toBeNull();
  });

  it("an odd ingot size rounds a milestone's gold up (25% of 1,001 needs 251)", () => {
    const v = view(250, 0, [version({ ingotSize: 1_001 })]);
    expect(v?.steps[0]).toMatchObject({ gold: 251, reached: false });
  });

  it("[P1-12] a reversal shortfall is shown as gold owed (0 when none); progress and steps are untouched", () => {
    expect(view(300)?.owed).toBe(0);
    const v = view(0, 1, [version()], { goldShortfall: 120 });
    expect(v?.owed).toBe(120);
    expect(v?.ingot.gold).toBe(0);
    expect(v?.steps.every((s) => !s.reached)).toBe(true);
    expect(view(0, 0, [version()], { goldShortfall: -5 })?.owed).toBe(0);
  });

  it("[P1-12] owed text: the gold owed and that the next gold pays it off first", () => {
    expect(owedText(120)).toBe(
      "120 gold owed from a reversed award. Your next gold pays it off first.",
    );
    expect(owedText(1_250)).toBe(
      "1,250 gold owed from a reversed award. Your next gold pays it off first.",
    );
  });
});
