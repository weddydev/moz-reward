/**
 * Loyalty programme rules (P1-05, PRODUCT §6). Pure and zod-free: the settings form, the history list, the
 * save service and the engine (P1-06) all read the same definitions. Validation of owner input lives in
 * `src/features/loyalty/programme-input.ts` (server only).
 *
 * Versions are immutable. Every save appends one, with two moments:
 *  - `activeFrom`: earn rules and the ingot size of ingots that start from now on.
 *  - `rewardsFrom`: the main reward and milestones. A change to them gives members 14 days' notice, so
 *    `rewardsFrom` is the save time + 14 days unless nothing about the rewards changed (see `rewardsFromFor`).
 * A member's current ingot keeps the terms it started under (`ingotTerms`), whatever is saved later.
 */

export const EARN_MODES = ["per_visit", "per_pound"] as const;
export type EarnMode = (typeof EARN_MODES)[number];

export const MILESTONE_PERCENTS = [25, 50, 75] as const;
export type MilestonePercent = (typeof MILESTONE_PERCENTS)[number];

export type MilestoneRule = { percent: MilestonePercent; reward: string; isMystery: boolean };

/** Everything an owner sets. Stored as one immutable version row. */
export type ProgrammeRules = {
  earnMode: EarnMode;
  /**
   * Gold per approved visit (`per_visit`) or per £1 spent (`per_pound`): floor(pence × rate / 100), rounded
   * down once after any multipliers (engine `calculateAward`), so £4.50 at 10 per £1 is 45.
   */
  earnRate: number;
  /** Gold needed to fill one ingot. */
  ingotSize: number;
  mainReward: { text: string };
  /** Up to 3, one per percent, sorted by percent. Repeat in every ingot (default — client to confirm). */
  milestones: MilestoneRule[];
  /** Bonus gold on the first approved visit of a week that extends a streak of ≥ 2 ISO weeks; null = off. */
  streak: { bonusGold: number } | null;
  /** Lifetime ingots for Silver and Gold (Bronze is 0). A status label only. */
  tiers: { silver: number; gold: number };
  /** Rolling expiry from the last approved visit; null = off. */
  expiryMonths: number | null;
};

export type ProgrammeVersion = ProgrammeRules & {
  id: string;
  version: number;
  activeFrom: Date;
  rewardsFrom: Date;
  createdAt: Date;
};

/** Field limits, shared by the server schema and the form's input attributes. */
export const LIMITS = {
  earnRate: { per_visit: { min: 1, max: 500 }, per_pound: { min: 1, max: 100 } },
  ingotSize: { min: 100, max: 100_000 },
  rewardText: { min: 2, max: 60 },
  streakBonus: { min: 1, max: 500 },
  tier: { min: 1, max: 1_000 },
  expiryMonths: { min: 12, max: 60 },
} as const;

export const REWARD_NOTICE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const TEMPLATE_IDS = ["cafe", "restaurant", "retail", "beauty"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const DEFAULT_TIERS = { silver: 2, gold: 5 } as const;

/** Starting points an owner picks from, then edits (PRODUCT §6 "Templates"). */
export const TEMPLATES: Readonly<Record<TemplateId, { name: string; rules: ProgrammeRules }>> = {
  cafe: {
    name: "Café classic",
    rules: {
      earnMode: "per_visit",
      earnRate: 100,
      ingotSize: 1_000,
      mainReward: { text: "Free drink of your choice" },
      milestones: [{ percent: 50, reward: "Free pastry", isMystery: false }],
      streak: { bonusGold: 50 },
      tiers: { ...DEFAULT_TIERS },
      expiryMonths: null,
    },
  },
  restaurant: {
    name: "Restaurant",
    rules: {
      earnMode: "per_pound",
      earnRate: 10,
      ingotSize: 2_000,
      mainReward: { text: "£15 off your bill" },
      milestones: [{ percent: 50, reward: "Mystery dessert", isMystery: true }],
      streak: null,
      tiers: { ...DEFAULT_TIERS },
      expiryMonths: null,
    },
  },
  retail: {
    name: "Retail",
    rules: {
      earnMode: "per_pound",
      earnRate: 5,
      ingotSize: 1_000,
      mainReward: { text: "£10 voucher" },
      milestones: [
        { percent: 25, reward: "Free gift wrap", isMystery: false },
        { percent: 75, reward: "Mystery treat", isMystery: true },
      ],
      streak: null,
      tiers: { ...DEFAULT_TIERS },
      expiryMonths: 12,
    },
  },
  beauty: {
    name: "Beauty",
    rules: {
      earnMode: "per_visit",
      earnRate: 200,
      ingotSize: 1_000,
      mainReward: { text: "Free treatment upgrade" },
      milestones: [{ percent: 50, reward: "Free product sample", isMystery: false }],
      streak: { bonusGold: 50 },
      tiers: { ...DEFAULT_TIERS },
      expiryMonths: null,
    },
  },
};

/** The rules part of a version (drops ids and dates), in a canonical order for comparison. */
export function rulesOf(v: ProgrammeRules): ProgrammeRules {
  return {
    earnMode: v.earnMode,
    earnRate: v.earnRate,
    ingotSize: v.ingotSize,
    mainReward: { text: v.mainReward.text },
    milestones: [...v.milestones]
      .sort((a, b) => a.percent - b.percent)
      .map((m) => ({ percent: m.percent, reward: m.reward, isMystery: m.isMystery })),
    streak: v.streak ? { bonusGold: v.streak.bonusGold } : null,
    tiers: { silver: v.tiers.silver, gold: v.tiers.gold },
    expiryMonths: v.expiryMonths,
  };
}

const rewardsKey = (r: ProgrammeRules): string =>
  JSON.stringify({ main: r.mainReward.text, milestones: rulesOf(r).milestones });

/** True when the main reward and milestones are the same (what the 14-day notice is about). */
export const sameRewards = (a: ProgrammeRules, b: ProgrammeRules): boolean =>
  rewardsKey(a) === rewardsKey(b);

export const sameRules = (a: ProgrammeRules, b: ProgrammeRules): boolean =>
  JSON.stringify(rulesOf(a)) === JSON.stringify(rulesOf(b));

/** The fields version resolution needs (the landing preview resolves public rows with them too). */
export type VersionDates = { version: number; activeFrom: Date; rewardsFrom: Date };

const byVersion = <V extends VersionDates>(versions: readonly V[]): V[] =>
  [...versions].sort((a, b) => a.version - b.version);

/**
 * The highest version for which `pick(v) <= at`. A time before the first version (an ingot started when the
 * member joined, before the shop set up its programme) resolves to the first version. Null only for none.
 */
function versionAt<V extends VersionDates>(
  versions: readonly V[],
  at: Date,
  pick: (v: V) => Date,
): V | null {
  const sorted = byVersion(versions);
  let found: V | null = null;
  for (const v of sorted) if (pick(v).getTime() <= at.getTime()) found = v;
  return found ?? sorted[0] ?? null;
}

/** The version whose earn rules apply at `at` (earn mode and rate, streak, expiry). */
export const versionActiveAt = <V extends VersionDates = ProgrammeVersion>(
  versions: readonly V[],
  at: Date,
): V | null => versionAt(versions, at, (v) => v.activeFrom);

/**
 * The version whose rewards apply at `at`. Ordered by version, not by date: a later save that reverts the
 * rewards inside a notice window (its `rewardsFrom` is earlier) wins from its own date on, which cancels the
 * pending change for good.
 */
export const rewardsVersionAt = <V extends VersionDates = ProgrammeVersion>(
  versions: readonly V[],
  at: Date,
): V | null => versionAt(versions, at, (v) => v.rewardsFrom);

/** What a member's ingot that started at `ingotStartedAt` completes under (PRODUCT §6 "Programme changes"). */
export function ingotTerms(
  versions: readonly ProgrammeVersion[],
  ingotStartedAt: Date,
): {
  ingotSize: number;
  sizeVersion: number;
  mainReward: { text: string };
  milestones: MilestoneRule[];
  rewardsVersion: number;
} | null {
  const size = versionActiveAt(versions, ingotStartedAt);
  const rewards = rewardsVersionAt(versions, ingotStartedAt);
  if (!size || !rewards) return null;
  return {
    ingotSize: size.ingotSize,
    sizeVersion: size.version,
    mainReward: { text: rewards.mainReward.text },
    milestones: rulesOf(rewards).milestones,
    rewardsVersion: rewards.version,
  };
}

/**
 * When the rewards of a version saved at `now` apply:
 *  - first version, or rewards equal to those in force now (unchanged, or an edit reverted inside the
 *    window): at once;
 *  - rewards equal to the latest pending change (another field edited while a notice runs): that change's
 *    date, so the notice is not restarted;
 *  - otherwise a new change: `now` + 14 days (a second change inside a window restarts its own notice).
 */
export function rewardsFromFor(
  versions: readonly ProgrammeVersion[],
  next: ProgrammeRules,
  now: Date,
): Date {
  const inForce = rewardsVersionAt(versions, now);
  if (!inForce || sameRewards(inForce, next)) return now;
  const latest = byVersion(versions).at(-1);
  if (latest && latest.rewardsFrom.getTime() > now.getTime() && sameRewards(latest, next)) {
    return latest.rewardsFrom;
  }
  return new Date(now.getTime() + REWARD_NOTICE_DAYS * DAY_MS);
}

/**
 * Rewards changes saved but not yet in force at `now`, oldest first, each shown in settings with its date.
 * A pending change that a later version overtakes (a later version whose rewards apply no later than it)
 * never takes effect, so it is left out.
 */
export function pendingRewardChanges(
  versions: readonly ProgrammeVersion[],
  now: Date,
): ProgrammeVersion[] {
  const sorted = byVersion(versions);
  return sorted.filter(
    (v, i) =>
      v.rewardsFrom.getTime() > now.getTime() &&
      !sorted.slice(i + 1).some((w) => w.rewardsFrom.getTime() <= v.rewardsFrom.getTime()),
  );
}

const gold = (n: number): string => `${n.toLocaleString("en-GB")} gold`;

export function describeEarn(r: Pick<ProgrammeRules, "earnMode" | "earnRate">): string {
  return r.earnMode === "per_visit"
    ? `${gold(r.earnRate)} per visit`
    : `${gold(r.earnRate)} per £1 spent`;
}

const describeMilestone = (m: MilestoneRule): string =>
  `${String(m.percent)}%: ${m.reward}${m.isMystery ? " (mystery)" : ""}`;

const describeExpiry = (months: number | null): string =>
  months === null ? "off" : `${String(months)} months`;

/** One plain line per changed setting, for the version history (`prev` null = the first version). */
export function describeChanges(prev: ProgrammeRules | null, next: ProgrammeRules): string[] {
  if (!prev) return ["Programme set up"];
  const a = rulesOf(prev);
  const b = rulesOf(next);
  const out: string[] = [];
  if (a.earnMode !== b.earnMode || a.earnRate !== b.earnRate)
    out.push(`Earning: ${describeEarn(a)} → ${describeEarn(b)}`);
  if (a.ingotSize !== b.ingotSize)
    out.push(`Ingot size: ${gold(a.ingotSize)} → ${gold(b.ingotSize)}`);
  if (a.mainReward.text !== b.mainReward.text)
    out.push(`Main reward: “${a.mainReward.text}” → “${b.mainReward.text}”`);
  const ma = a.milestones.map(describeMilestone).join("; ") || "none";
  const mb = b.milestones.map(describeMilestone).join("; ") || "none";
  if (ma !== mb) out.push(`Milestones: ${ma} → ${mb}`);
  const sa = a.streak ? `${gold(a.streak.bonusGold)} bonus` : "off";
  const sb = b.streak ? `${gold(b.streak.bonusGold)} bonus` : "off";
  if (sa !== sb) out.push(`Streak: ${sa} → ${sb}`);
  if (a.tiers.silver !== b.tiers.silver || a.tiers.gold !== b.tiers.gold)
    out.push(
      `Tiers: Silver ${String(a.tiers.silver)}, Gold ${String(a.tiers.gold)} → Silver ${String(b.tiers.silver)}, Gold ${String(b.tiers.gold)} ingots`,
    );
  if (a.expiryMonths !== b.expiryMonths)
    out.push(`Gold expiry: ${describeExpiry(a.expiryMonths)} → ${describeExpiry(b.expiryMonths)}`);
  return out;
}

/** Visits to fill one ingot at the base rate (per-visit only; per-pound depends on spend). */
export function visitsPerIngot(
  r: Pick<ProgrammeRules, "earnMode" | "earnRate" | "ingotSize">,
): number | null {
  return r.earnMode === "per_visit" ? Math.ceil(r.ingotSize / r.earnRate) : null;
}
