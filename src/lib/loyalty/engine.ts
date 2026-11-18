/**
 * Loyalty engine (P1-06; PRODUCT §5, §6, §19). Pure: every input is explicit (programme versions, member
 * state, the instant) and nothing here reads a clock, the database or the environment. The approval service
 * (P1-12) loads the state under a row lock, calls these functions and writes the ledger rows they describe;
 * the expiry job (P1-13) does the same with `computeExpiry`.
 *
 * Which programme version applies (PRODUCT §6 "Programme changes"):
 *  - earning (mode, rate, streak bonus): the version active at the request's `requestedAt`;
 *  - the current ingot's size, main reward and milestones: the terms it started under (`ingotTerms`);
 *  - tier thresholds: the version active at the award; expiry: the version active now.
 *
 * Amounts are whole gold (`Points`) and whole pence (`Pence`); multipliers are whole percents (150 = 1.5×).
 * The arithmetic is integer only (BigInt for the multiplier product), so nothing is lost to floating point.
 */
import { type Pence, type Points, points } from "@/lib/brand";
import { addDays, addLondonDays, addLondonMonths, londonWeekStart } from "@/lib/time";

import {
  type MilestonePercent,
  type ProgrammeVersion,
  ingotTerms,
  versionActiveAt,
} from "./programme";

export const TIERS = ["bronze", "silver", "gold"] as const;
export type Tier = (typeof TIERS)[number];

/** Consecutive ISO weeks (Mon–Sun, Europe/London) with at least one approved visit. */
export type StreakState = {
  weeks: number;
  /** Monday (YYYY-MM-DD, London) of the last week with an approved visit; null before the first. */
  lastWeekStart: string | null;
};

/** What the engine needs to know about one membership (P1-12 stores it on the membership row). */
export type MemberState = {
  /** Gold in the current ingot: always ≥ 0 and below that ingot's size. */
  progress: Points;
  /** Lifetime ingots filled (each unlocked its main reward). Never decreases. */
  ingotsCompleted: number;
  /** When the current ingot started: its size and rewards are the terms in force then. */
  ingotStartedAt: Date;
  /** Milestones already unlocked in the current ingot (each unlocks once per ingot). */
  milestonesReached: readonly MilestonePercent[];
  /** Gold reversed beyond the progress there was (`gold_shortfall`); paid off by future earns first. */
  shortfall: Points;
  /** Status label from lifetime ingots; never lowered. */
  tier: Tier;
  streak: StreakState;
};

export const initialMemberState = (joinedAt: Date): MemberState => ({
  progress: points(0),
  ingotsCompleted: 0,
  ingotStartedAt: joinedAt,
  milestonesReached: [],
  shortfall: points(0),
  tier: "bronze",
  streak: { weeks: 0, lastWeekStart: null },
});

/** An active multiplier (happy hour, a promotion…), judged by the caller at `requestedAt`. */
export type Multiplier = { source: string; percent: number };

const MULTIPLIER_PERCENT = { min: 100, max: 1_000 } as const;

export type AwardInput = {
  versions: readonly ProgrammeVersion[];
  /** The amount spent; required for per-pound programmes, ignored (receipt only) for per-visit ones. */
  amountPence: Pence | null;
  /** Server receipt time of the request (PRODUCT §5), never the client's clock. */
  requestedAt: Date;
  multipliers: readonly Multiplier[];
  /** The member's streak before this visit. */
  streak: StreakState;
};

export type Award = {
  /** The earn version used (active at `requestedAt`). */
  version: number;
  /** Gold before multipliers, rounded down. */
  base: Points;
  multipliers: readonly Multiplier[];
  /** Gold after all multipliers, rounded down once (an `earn` ledger row). */
  earned: Points;
  /** Streak bonus (a `bonus_streak` ledger row); not multiplied. */
  streakBonus: Points;
  /** `earned` + `streakBonus`: what this approval adds to the ledger. */
  total: Points;
  /** The member's streak after this visit. */
  streak: StreakState;
};

function programmeError(): RangeError {
  return new RangeError("the shop has no loyalty programme");
}

function nextStreak(
  prev: StreakState,
  requestedAt: Date,
): { streak: StreakState; extended: boolean } {
  const week = londonWeekStart(requestedAt);
  const last = prev.lastWeekStart;
  // Same week, or a late approval of a visit from an earlier week: the streak is unchanged.
  if (last !== null && week <= last) return { streak: prev, extended: false };
  if (last !== null && addDays(last, 7) === week) {
    return { streak: { weeks: prev.weeks + 1, lastWeekStart: week }, extended: true };
  }
  return { streak: { weeks: 1, lastWeekStart: week }, extended: false };
}

/**
 * Gold for one approved visit: the base from the earn rules, every multiplier multiplied together and the
 * result rounded down to whole gold once (default — client to confirm), plus the streak bonus when this is
 * the first approved visit of a week that extends a streak to 2 weeks or more.
 */
export function calculateAward(input: AwardInput): Award {
  const v = versionActiveAt(input.versions, input.requestedAt);
  if (!v) throw programmeError();
  for (const m of input.multipliers) {
    if (
      !Number.isInteger(m.percent) ||
      m.percent < MULTIPLIER_PERCENT.min ||
      m.percent > MULTIPLIER_PERCENT.max
    ) {
      throw new RangeError(
        `multiplier must be a whole percent from 100 to 1000, got ${String(m.percent)}`,
      );
    }
  }

  let numerator: bigint;
  let denominator: bigint;
  switch (v.earnMode) {
    case "per_visit":
      numerator = BigInt(v.earnRate);
      denominator = 1n;
      break;
    case "per_pound":
      if (input.amountPence === null)
        throw new RangeError("a per-pound award needs the amount spent");
      numerator = BigInt(input.amountPence) * BigInt(v.earnRate);
      denominator = 100n;
      break;
    default: {
      const never: never = v.earnMode;
      throw new RangeError(`unknown earn mode ${String(never)}`);
    }
  }
  const base = numerator / denominator;
  for (const m of input.multipliers) {
    numerator *= BigInt(m.percent);
    denominator *= 100n;
  }
  const earned = numerator / denominator;

  const { streak, extended } = nextStreak(input.streak, input.requestedAt);
  const bonus = extended && streak.weeks >= 2 && v.streak ? v.streak.bonusGold : 0;

  return {
    version: v.version,
    base: points(Number(base)),
    multipliers: [...input.multipliers],
    earned: points(Number(earned)),
    streakBonus: points(bonus),
    total: points(Number(earned) + bonus),
    streak,
  };
}

export type UnlockedIngot = {
  ingotNumber: number;
  ingotSize: Points;
  mainReward: { text: string };
  sizeVersion: number;
  rewardsVersion: number;
};

export type UnlockedMilestone = {
  ingotNumber: number;
  percent: MilestonePercent;
  reward: string;
  isMystery: boolean;
  rewardsVersion: number;
};

export type AwardOutcome = {
  state: MemberState;
  /** Gold of this award that paid off a shortfall instead of counting as progress. */
  shortfallOffset: Points;
  /** Ingots this award filled, in order; each unlocks its main reward. */
  ingots: UnlockedIngot[];
  /** Milestones this award reached, in order (ingot, then percent). */
  milestones: UnlockedMilestone[];
  tierRaised: boolean;
};

function termsAt(versions: readonly ProgrammeVersion[], ingotStartedAt: Date) {
  const terms = ingotTerms(versions, ingotStartedAt);
  if (!terms) throw programmeError();
  return terms;
}

const TIER_RANK: Readonly<Record<Tier, number>> = { bronze: 0, silver: 1, gold: 2 };

function tierFor(ingots: number, tiers: { silver: number; gold: number }): Tier {
  if (ingots >= tiers.gold) return "gold";
  if (ingots >= tiers.silver) return "silver";
  return "bronze";
}

/**
 * Adds an award (approved at `at`) to a member's state: any shortfall is paid off first, then gold fills the
 * current ingot. Reaching the ingot size fills it (ingots completed + 1, main reward unlocked) and the
 * overflow carries into the next ingot, which starts at `at` under the terms in force then; one award can
 * fill several ingots. Milestones unlock as progress passes them, once per ingot, and repeat in every ingot.
 */
export function applyAward(
  state: MemberState,
  award: Award,
  versions: readonly ProgrammeVersion[],
  at: Date,
): AwardOutcome {
  let gold: number = award.total;
  const shortfallOffset = Math.min(gold, state.shortfall);
  gold -= shortfallOffset;

  let progress: number = state.progress;
  let completed = state.ingotsCompleted;
  let startedAt = state.ingotStartedAt;
  let reached: MilestonePercent[] = [...state.milestonesReached];
  let terms = termsAt(versions, startedAt);
  const ingots: UnlockedIngot[] = [];
  const milestones: UnlockedMilestone[] = [];

  for (;;) {
    const added = Math.min(gold, Math.max(terms.ingotSize - progress, 0));
    progress += added;
    gold -= added;
    for (const m of terms.milestones) {
      if (!reached.includes(m.percent) && progress * 100 >= terms.ingotSize * m.percent) {
        reached.push(m.percent);
        milestones.push({
          ingotNumber: completed + 1,
          percent: m.percent,
          reward: m.reward,
          isMystery: m.isMystery,
          rewardsVersion: terms.rewardsVersion,
        });
      }
    }
    if (progress < terms.ingotSize) break;
    completed += 1;
    ingots.push({
      ingotNumber: completed,
      ingotSize: points(terms.ingotSize),
      mainReward: { text: terms.mainReward.text },
      sizeVersion: terms.sizeVersion,
      rewardsVersion: terms.rewardsVersion,
    });
    gold += progress - terms.ingotSize; // only non-zero if a stored state was already over its size
    progress = 0;
    reached = [];
    startedAt = at;
    terms = termsAt(versions, at);
  }

  const rules = versionActiveAt(versions, at);
  const earnedTier = rules ? tierFor(completed, rules.tiers) : state.tier;
  const tier = TIER_RANK[earnedTier] > TIER_RANK[state.tier] ? earnedTier : state.tier;

  return {
    state: {
      progress: points(progress),
      ingotsCompleted: completed,
      ingotStartedAt: startedAt,
      milestonesReached: reached,
      shortfall: points(state.shortfall - shortfallOffset),
      tier,
      streak: award.streak,
    },
    shortfallOffset: points(shortfallOffset),
    ingots,
    milestones,
    tierRaised: tier !== state.tier,
  };
}

export type ReversalOutcome = {
  state: MemberState;
  /** Gold taken from current-ingot progress. */
  fromProgress: Points;
  /** Gold that progress could not cover, added to the shortfall. */
  toShortfall: Points;
};

/**
 * A reversal (refund or mistaken award, PRODUCT §5): reduces current-ingot progress only, floored at 0; the
 * rest becomes a shortfall that future earns pay off first. Completed ingots, unlocked rewards, milestones
 * already reached and the tier are never touched.
 */
export function applyReversal(state: MemberState, gold: Points): ReversalOutcome {
  const fromProgress = Math.min(gold, state.progress);
  const toShortfall = gold - fromProgress;
  return {
    state: {
      ...state,
      progress: points(state.progress - fromProgress),
      shortfall: points(state.shortfall + toShortfall),
    },
    fromProgress: points(fromProgress),
    toShortfall: points(toShortfall),
  };
}

/** How many recent awards the visit estimate averages. */
export const ESTIMATE_RECENT_AWARDS = 10;

/**
 * Visits still needed to fill the current ingot, from the average of the member's last 10 awards (the
 * Wallet's "1 more visit" nudge). A shortfall counts as gold still to earn. Null with no usable history.
 */
export function estimateVisitsToNext(
  state: MemberState,
  recentAwards: readonly Points[],
  versions: readonly ProgrammeVersion[],
): number | null {
  const terms = termsAt(versions, state.ingotStartedAt);
  const recent = recentAwards.slice(-ESTIMATE_RECENT_AWARDS);
  const sum = recent.reduce((total, g) => total + g, 0);
  if (sum === 0) return null;
  const remaining = terms.ingotSize - state.progress + state.shortfall;
  return Math.ceil((remaining * recent.length) / sum);
}

/** Expiry warnings (inbox + push, transactional) go out this many days before (PRODUCT §6). */
export const EXPIRY_WARNING_DAYS = [30, 7] as const;

export type Expiry =
  /** The programme has no expiry. */
  | { kind: "off" }
  /** No current-ingot gold, or no approved visit to measure from. */
  | { kind: "nothing" }
  | {
      kind: "scheduled";
      expiresAt: Date;
      gold: Points;
      warnings: { daysBefore: (typeof EXPIRY_WARNING_DAYS)[number]; at: Date }[];
    }
  /** Expiry has passed: write an `expiry` ledger row for `gold` and store `state`. */
  | { kind: "due"; expiresAt: Date; gold: Points; state: MemberState };

/**
 * Rolling expiry (PRODUCT §6): current-ingot gold expires `expiryMonths` London calendar months after the
 * member's last approved visit at the shop, under the expiry setting in force `now`. Expiry removes only
 * current-ingot progress; completed ingots, unlocked rewards, milestones, tier and any shortfall stay.
 */
export function computeExpiry(
  state: MemberState,
  versions: readonly ProgrammeVersion[],
  lastApprovedVisitAt: Date | null,
  now: Date,
): Expiry {
  const rules = versionActiveAt(versions, now);
  if (!rules || rules.expiryMonths === null) return { kind: "off" };
  if (state.progress === 0 || lastApprovedVisitAt === null) return { kind: "nothing" };
  const expiresAt = addLondonMonths(lastApprovedVisitAt, rules.expiryMonths);
  if (now.getTime() >= expiresAt.getTime()) {
    return {
      kind: "due",
      expiresAt,
      gold: state.progress,
      state: { ...state, progress: points(0) },
    };
  }
  return {
    kind: "scheduled",
    expiresAt,
    gold: state.progress,
    warnings: EXPIRY_WARNING_DAYS.map((daysBefore) => ({
      daysBefore,
      at: addLondonDays(expiresAt, -daysBefore),
    })),
  };
}
