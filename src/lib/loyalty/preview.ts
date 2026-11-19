import {
  type MilestoneRule,
  rewardsVersionAt,
  type VersionDates,
  versionActiveAt,
} from "./programme";

/**
 * The shop landing's reward preview (P1-08, C-50): what someone who joins now works towards. Public data only:
 * the database function `shop_reward_preview` (0026) blanks every mystery reward's text before it leaves
 * Postgres, and this never needs it.
 */
export type PublicVersion = VersionDates & {
  ingotSize: number;
  mainReward: { text: string };
  milestones: MilestoneRule[];
};

export type RewardPreview = {
  ingotSize: number;
  /** The first reward a new member reaches: the lowest milestone, or the main reward when there is none. */
  next: { percent: number; gold: number; title: string };
  main: { text: string; gold: number };
};

/** A new member's ingot starts now: its size from the version active now, rewards from the one in force now. */
export function rewardPreview(versions: readonly PublicVersion[], now: Date): RewardPreview | null {
  const size = versionActiveAt(versions, now);
  const rewards = rewardsVersionAt(versions, now);
  if (!size || !rewards) return null;
  const ingotSize = size.ingotSize;
  const first = [...rewards.milestones].sort((a, b) => a.percent - b.percent)[0];
  const main = { text: rewards.mainReward.text, gold: ingotSize };
  return {
    ingotSize,
    next: first
      ? {
          percent: first.percent,
          gold: Math.ceil((ingotSize * first.percent) / 100),
          title: first.isMystery ? "Mystery reward" : first.reward,
        }
      : { percent: 100, gold: ingotSize, title: main.text },
    main,
  };
}
