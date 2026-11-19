import { describe, expect, it } from "vitest";
import { type PublicVersion, rewardPreview } from "./preview";

const NOW = new Date("2026-11-19T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const v = (over: Partial<PublicVersion> = {}): PublicVersion => ({
  version: 1,
  ingotSize: 1_000,
  mainReward: { text: "Free coffee & cake" },
  milestones: [
    { percent: 50, reward: "Free pastry", isMystery: false },
    { percent: 25, reward: "Bonus 50 gold", isMystery: false },
  ],
  activeFrom: new Date(NOW.getTime() - 30 * DAY),
  rewardsFrom: new Date(NOW.getTime() - 30 * DAY),
  ...over,
});

describe("[P1-08] landing reward preview (C-50)", () => {
  it("no programme → nothing to preview", () => {
    expect(rewardPreview([], NOW)).toBeNull();
  });

  it("the next reward is the lowest milestone, with the gold it needs", () => {
    expect(rewardPreview([v()], NOW)).toEqual({
      ingotSize: 1_000,
      next: { percent: 25, gold: 250, title: "Bonus 50 gold" },
      main: { text: "Free coffee & cake", gold: 1_000 },
    });
  });

  it("a mystery milestone is previewed as a mystery", () => {
    const p = rewardPreview(
      [v({ milestones: [{ percent: 25, reward: "", isMystery: true }] })],
      NOW,
    );
    expect(p?.next).toEqual({ percent: 25, gold: 250, title: "Mystery reward" });
  });

  it("no milestones → the main reward is next", () => {
    expect(rewardPreview([v({ milestones: [] })], NOW)?.next).toEqual({
      percent: 100,
      gold: 1_000,
      title: "Free coffee & cake",
    });
  });

  it("uses what applies to someone joining now: a pending rewards change isn't shown yet", () => {
    const pending = v({
      version: 2,
      ingotSize: 2_000,
      mainReward: { text: "New reward" },
      activeFrom: new Date(NOW.getTime() - DAY),
      rewardsFrom: new Date(NOW.getTime() + 13 * DAY),
    });
    const p = rewardPreview([v(), pending], NOW);
    expect(p?.ingotSize).toBe(2_000); // size applies at once
    expect(p?.main).toEqual({ text: "Free coffee & cake", gold: 2_000 }); // rewards after the notice
  });
});
