import { initialMemberState } from "@/lib/loyalty/engine";
import { type IngotFill, ingotFill } from "@/lib/loyalty/ingot";
import { ingotTerms, type ProgrammeVersion, versionActiveAt } from "@/lib/loyalty/programme";

/**
 * Pure view logic for the Gold Vault page (P1-08, PRODUCT §6, DESIGN §15 screen 5). UK English (DESIGN §14).
 * Only what may be shown leaves here: a mystery milestone's reward text stays on the server until the member
 * reaches it.
 */

export type TierName = "Bronze" | "Silver" | "Gold";

export type VaultStep = {
  percent: number;
  /** Gold at which this step is reached in the current ingot. */
  gold: number;
  /** The reward, or "Mystery reward" for a mystery milestone not reached yet. */
  title: string;
  reached: boolean;
  main: boolean;
  mystery: boolean;
};

export type VaultView = {
  ingot: IngotFill;
  steps: VaultStep[];
  streak: { bonusGold: number } | null;
  tier: {
    name: TierName;
    ingots: number;
    ladder: { name: TierName; from: number; current: boolean }[];
    /** The next tier and how many more full ingots reach it; null at Gold. */
    next: { name: TierName; ingotsToGo: number } | null;
  };
  shelf: { completed: number; slots: number };
  howItWorks: { earn: string; unlock: string; tiers: string };
};

export type VaultInput = {
  progressGold: number;
  ingotsCompleted: number;
  joinedAt: Date;
  versions: readonly ProgrammeVersion[];
};

const gb = (n: number): string => n.toLocaleString("en-GB");

/** "25%, 50% and 100%". */
const listPercents = (ps: readonly number[]): string => {
  const parts = ps.map((p) => `${String(p)}%`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`
    : (parts[0] ?? "");
};

export const ingotsWord = (n: number): string => (n === 1 ? "ingot" : "ingots");

/** Shelf slots drawn: five, or as many as needed to show every completed ingot plus the one in progress. */
export const SHELF_MIN_SLOTS = 5;

export function tierFor(ingots: number, tiers: { silver: number; gold: number }): TierName {
  if (ingots >= tiers.gold) return "Gold";
  if (ingots >= tiers.silver) return "Silver";
  return "Bronze";
}

/**
 * The Vault for one membership, or null when the shop has no programme yet. The current ingot's terms come
 * from the version it started under; until P1-12 stores `ingot_started_at` that is the join date, as on the
 * Wallet (C-60). Tiers use the version in force now. Milestones repeat in every ingot (PRODUCT §6).
 */
export function vaultView(input: VaultInput, now: Date): VaultView | null {
  if (input.versions.length === 0) return null;
  const terms = ingotTerms(input.versions, initialMemberState(input.joinedAt).ingotStartedAt);
  const current = versionActiveAt(input.versions, now);
  if (!terms || !current) return null;
  const ingot = ingotFill(input.progressGold, terms.ingotSize);
  const stepGold = (pct: number): number => Math.ceil((terms.ingotSize * pct) / 100);
  const steps: VaultStep[] = [
    ...terms.milestones.map((m) => {
      const gold = stepGold(m.percent);
      const reached = ingot.gold >= gold;
      return {
        percent: m.percent,
        gold,
        title: m.isMystery && !reached ? "Mystery reward" : m.reward,
        reached,
        main: false,
        mystery: m.isMystery,
      };
    }),
    {
      percent: 100,
      gold: terms.ingotSize,
      title: terms.mainReward.text,
      reached: ingot.fraction >= 1,
      main: true,
      mystery: false,
    },
  ];

  const ingots = Math.max(0, input.ingotsCompleted);
  const { silver, gold } = current.tiers;
  const name = tierFor(ingots, current.tiers);
  const ladder = [
    { name: "Bronze" as const, from: 0 },
    { name: "Silver" as const, from: silver },
    { name: "Gold" as const, from: gold },
  ].map((t) => ({ ...t, current: t.name === name }));
  const next =
    name === "Bronze"
      ? { name: "Silver" as const, ingotsToGo: silver - ingots }
      : name === "Silver"
        ? { name: "Gold" as const, ingotsToGo: gold - ingots }
        : null;

  const earn =
    current.earnMode === "per_visit"
      ? `Collect ${gb(current.earnRate)} gold on every visit.`
      : `Collect ${gb(current.earnRate)} gold for every £1 you spend.`;
  return {
    ingot,
    steps,
    streak: current.streak ? { bonusGold: current.streak.bonusGold } : null,
    tier: { name, ingots, ladder, next },
    shelf: { completed: ingots, slots: Math.max(SHELF_MIN_SLOTS, ingots + 1) },
    howItWorks: {
      earn,
      unlock: `Rewards unlock at ${listPercents(steps.map((s) => s.percent))} of each ingot.`,
      tiers: `Fill ${gb(silver)} ${ingotsWord(silver)} for Silver and ${gb(gold)} for Gold.`,
    },
  };
}

/** "720 / 1,000 gold". */
export const vaultGoldText = (f: IngotFill): string => `${gb(f.gold)} / ${gb(f.size)} gold`;

/** "2 ingots collected", or how far the first one is. */
export function shelfText(completed: number, size: number): string {
  if (completed === 0) return `Your first ingot fills at ${gb(size)} gold.`;
  return `${gb(completed)} ${ingotsWord(completed)} collected`;
}

/** "1 more ingot to Silver". */
export const nextTierText = (next: { name: TierName; ingotsToGo: number }): string =>
  `${gb(next.ingotsToGo)} more ${ingotsWord(next.ingotsToGo)} to ${next.name}`;
