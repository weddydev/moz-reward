import { describe, expect, it } from "vitest";
import { type ProgrammeRules, type ProgrammeVersion } from "./programme";
import { type LedgerRowForReplay, replayLedger } from "./replay";

const T0 = new Date("2026-01-05T10:00:00Z");
const at = (min: number): Date => new Date(T0.getTime() + min * 60_000);

const rules: ProgrammeRules = {
  earnMode: "per_visit",
  earnRate: 100,
  ingotSize: 1_000,
  mainReward: { text: "Free coffee" },
  milestones: [{ percent: 50, reward: "Pastry", isMystery: false }],
  streak: null,
  tiers: { silver: 2, gold: 5 },
  expiryMonths: null,
  rewardValidDays: 90,
};
const v = (version: number, from: Date, over: Partial<ProgrammeRules> = {}): ProgrammeVersion => ({
  ...rules,
  ...over,
  id: `v${String(version)}`,
  version,
  activeFrom: from,
  rewardsFrom: from,
  createdAt: from,
});
const V1 = [v(1, new Date("2025-01-01T00:00:00Z"))];

const earn = (requestId: string, points: number, min: number): LedgerRowForReplay => ({
  type: "earn",
  points,
  requestId,
  createdAt: at(min),
  ref: {},
});

describe("[P1-17] ledger replay (the counters a membership's ledger implies)", () => {
  it("[P1-17] no ledger: an empty ingot", () => {
    expect(replayLedger({ joinedAt: T0, versions: V1, rows: [] })).toEqual({
      progress: 0,
      ingotsCompleted: 0,
      shortfall: 0,
    });
  });

  it("[P1-17] earns fill ingots with overflow; earn + streak bonus of one request count as one award", () => {
    const rows: LedgerRowForReplay[] = [
      earn("r1", 600, 1),
      earn("r2", 300, 2),
      { type: "bonus_streak", points: 200, requestId: "r2", createdAt: at(2), ref: {} },
    ];
    expect(replayLedger({ joinedAt: T0, versions: V1, rows })).toEqual({
      progress: 100,
      ingotsCompleted: 1,
      shortfall: 0,
    });
  });

  it("[P1-17] a reversal takes progress down to 0 and the rest becomes a shortfall that the next earn pays first", () => {
    const rows: LedgerRowForReplay[] = [
      earn("r1", 1_100, 1), // fills one, 100 over
      { type: "reversal", points: -300, requestId: null, createdAt: at(2), ref: {} },
      earn("r3", 250, 3),
    ];
    // 100 − 300 → 0 with 200 owed; then 250 pays the 200 first: 50.
    expect(replayLedger({ joinedAt: T0, versions: V1, rows })).toEqual({
      progress: 50,
      ingotsCompleted: 1,
      shortfall: 0,
    });
  });

  it("[P1-17] expiry empties the current ingot; redeem rows change nothing", () => {
    const rows: LedgerRowForReplay[] = [
      earn("r1", 400, 1),
      { type: "redeem", points: 0, requestId: null, createdAt: at(2), ref: {} },
      { type: "expiry", points: -400, requestId: null, createdAt: at(3), ref: {} },
      earn("r2", 100, 4),
    ];
    expect(replayLedger({ joinedAt: T0, versions: V1, rows })).toEqual({
      progress: 100,
      ingotsCompleted: 0,
      shortfall: 0,
    });
  });

  it("[P1-17] an opening adjustment (demo seed) sets the starting counters", () => {
    const rows: LedgerRowForReplay[] = [
      {
        type: "adjustment",
        points: 720,
        requestId: null,
        createdAt: at(0),
        ref: { reason: "opening", ingots: 3 },
      },
      earn("r1", 400, 1),
    ];
    expect(replayLedger({ joinedAt: T0, versions: V1, rows })).toEqual({
      progress: 120,
      ingotsCompleted: 4,
      shortfall: 0,
    });
  });

  it("[P1-17] an ingot size change applies from the next ingot (the version at the ingot's start)", () => {
    const versions = [v(1, new Date("2025-01-01T00:00:00Z")), v(2, at(5), { ingotSize: 500 })];
    const rows = [earn("r1", 900, 1), earn("r2", 200, 10), earn("r3", 450, 11)];
    // Ingot 1 started under v1 (1,000): 900 + 200 fills it at 1,100 → 100 over into ingot 2, which starts at
    // minute 10 under v2 (500): 100 + 450 = 550 → fills, 50 over.
    expect(replayLedger({ joinedAt: T0, versions, rows })).toEqual({
      progress: 50,
      ingotsCompleted: 2,
      shortfall: 0,
    });
  });
});
