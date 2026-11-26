import { type IngotFill, ingotFill } from "@/lib/loyalty/ingot";
import { ingotTerms, type ProgrammeVersion, versionActiveAt } from "@/lib/loyalty/programme";
import { addDays, londonWeekStart } from "@/lib/time";

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
  /**
   * The programme's streak bonus and the member's current streak in weeks (0 when there is none, or it broke:
   * no approved visit this week or last); null when the programme has no streak bonus.
   */
  streak: { bonusGold: number; weeks: number } | null;
  /** Gold a visit earns under the rules in force now ("about N visits"); null when gold is earned per £1. */
  perVisit: number | null;
  tier: {
    name: TierName;
    ingots: number;
    ladder: { name: TierName; from: number; current: boolean }[];
    /** The next tier and how many more full ingots reach it; null at Gold. */
    next: { name: TierName; ingotsToGo: number } | null;
  };
  shelf: { completed: number; slots: number };
  /**
   * Gold owed from a reversal larger than the progress there was (`gold_shortfall`, PRODUCT §5): the member's
   * next gold pays it off before it counts as progress. 0 when nothing is owed.
   */
  owed: number;
  howItWorks: { earn: string; unlock: string; tiers: string };
};

export type VaultInput = {
  progressGold: number;
  ingotsCompleted: number;
  joinedAt: Date;
  /** When the current ingot started (null = at `joinedAt`, C-60). */
  ingotStartedAt: Date | null;
  /** The highest tier the membership reached (stored by approvals, never lowered, C-66). */
  tier: "bronze" | "silver" | "gold";
  streakWeeks: number;
  /** Monday (London, YYYY-MM-DD) of the streak's last week with an approved visit. */
  streakLastWeekStart: string | null;
  /** Gold reversed beyond the progress there was (`gold_shortfall`, P1-12). */
  goldShortfall: number;
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

const TIER_NAMES = { bronze: "Bronze", silver: "Silver", gold: "Gold" } as const;
const TIER_ORDER: readonly TierName[] = ["Bronze", "Silver", "Gold"];

/**
 * The member's current streak in weeks: the stored count while its last week is this week or last week
 * (London, Monday start), else 0 (a week with no approved visit broke it; the next approval starts at 1).
 */
export function currentStreakWeeks(
  input: { streakWeeks: number; streakLastWeekStart: string | null },
  now: Date,
): number {
  if (input.streakLastWeekStart === null || input.streakWeeks <= 0) return 0;
  const thisWeek = londonWeekStart(now);
  return input.streakLastWeekStart === thisWeek ||
    input.streakLastWeekStart === addDays(thisWeek, -7)
    ? input.streakWeeks
    : 0;
}

/**
 * The Vault for one membership, or null when the shop has no programme yet. The current ingot's terms come
 * from the version it started under (`ingot_started_at`, else the join date; C-60). Tier thresholds are the
 * version in force now, but the tier shown is never below the highest one stored on the membership: an owner
 * raising a threshold never lowers a member (C-66). Milestones repeat in every ingot (PRODUCT §6).
 */
export function vaultView(input: VaultInput, now: Date): VaultView | null {
  if (input.versions.length === 0) return null;
  const terms = ingotTerms(input.versions, input.ingotStartedAt ?? input.joinedAt);
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
  const earned = tierFor(ingots, current.tiers);
  const stored = TIER_NAMES[input.tier];
  const name = TIER_ORDER.indexOf(stored) > TIER_ORDER.indexOf(earned) ? stored : earned;
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
    streak: current.streak
      ? { bonusGold: current.streak.bonusGold, weeks: currentStreakWeeks(input, now) }
      : null,
    perVisit: current.earnMode === "per_visit" ? current.earnRate : null,
    tier: { name, ingots, ladder, next },
    shelf: { completed: ingots, slots: Math.max(SHELF_MIN_SLOTS, ingots + 1) },
    owed: Math.max(0, input.goldShortfall),
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

/**
 * The streak chip: "3-week streak · bonus gold active" while a streak of 2 weeks or more is current (the next
 * week's first visit pays the bonus), else the rule ("Visit 2 weeks running for +50 bonus gold").
 */
export const streakText = (streak: { bonusGold: number; weeks: number }): string =>
  streak.weeks >= 2
    ? `${gb(streak.weeks)}-week streak · bonus gold active`
    : `Visit 2 weeks running for +${gb(streak.bonusGold)} bonus gold`;

/** The gold-owed note after a reversal larger than the progress (PRODUCT §5 "Reversal"). */
export const owedText = (owed: number): string =>
  `${gb(owed)} gold owed from a reversed award. Your next gold pays it off first.`;

/** "1 more ingot to Silver". */
export const nextTierText = (next: { name: TierName; ingotsToGo: number }): string =>
  `${gb(next.ingotsToGo)} more ${ingotsWord(next.ingotsToGo)} to ${next.name}`;
