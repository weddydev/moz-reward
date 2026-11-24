import { describe, expect, it } from "vitest";
import { type ProgrammeVersion, TEMPLATES } from "@/lib/loyalty/programme";
import { nextTierText, shelfText, tierFor, vaultGoldText, vaultView } from "./view";

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

const view = (progressGold: number, ingotsCompleted = 0, versions = [version()]) =>
  vaultView({ progressGold, ingotsCompleted, joinedAt: JOINED, versions }, NOW);

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
    expect(view(0)?.streak).toEqual({ bonusGold: 50 });
    expect(view(0, 0, [version({ streak: null })])?.streak).toBeNull();
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
});
