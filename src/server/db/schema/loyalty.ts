/**
 * P1-05 loyalty programmes (ARCHITECTURE §4, PRODUCT §6). One row per version, never updated (trigger 0024);
 * a save appends `version + 1`. `active_from` is when the earn rules and the ingot size of new ingots apply;
 * `rewards_from` is when the main reward and milestones apply (14 days' notice for a change). Resolution rules:
 * `src/lib/loyalty/programme.ts`. The jsonb shapes are the `ProgrammeRules` fields, validated on the way in by
 * `src/features/loyalty/programme-input.ts`; the CHECKs are the database's second wall on the numbers.
 */
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { MilestoneRule } from "@/lib/loyalty/programme";
import { id, timestamps, tz } from "./_columns";
import { shops } from "./core";

export const loyaltyEarnMode = pgEnum("loyalty_earn_mode", ["per_visit", "per_pound"]);

export const loyaltyPrograms = pgTable(
  "loyalty_programs",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    earnMode: loyaltyEarnMode().notNull(),
    earnRate: integer().notNull(),
    ingotSize: integer().notNull(),
    mainReward: jsonb().$type<{ text: string }>().notNull(),
    milestones: jsonb().$type<MilestoneRule[]>().notNull(),
    streak: jsonb().$type<{ bonusGold: number }>(),
    tiers: jsonb().$type<{ silver: number; gold: number }>().notNull(),
    expiryMonths: smallint(),
    activeFrom: tz().notNull(),
    rewardsFrom: tz().notNull(),
    /**
     * The owner who saved it. No FK, like audit_logs: versions are never updated, so an erased account can't be
     * nulled out here, and the id alone is pseudonymous once the account row is gone.
     */
    createdBy: uuid().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("loyalty_programs_shop_version_uq").on(t.shopId, t.version),
    check("loyalty_programs_version_positive", sql`${t.version} >= 1`),
    check(
      "loyalty_programs_earn_rate_range",
      sql`(${t.earnMode} = 'per_visit' AND ${t.earnRate} BETWEEN 1 AND 500) OR (${t.earnMode} = 'per_pound' AND ${t.earnRate} BETWEEN 1 AND 100)`,
    ),
    check("loyalty_programs_ingot_size_range", sql`${t.ingotSize} BETWEEN 100 AND 100000`),
    check(
      "loyalty_programs_main_reward_shape",
      sql`jsonb_typeof(${t.mainReward}) = 'object' AND jsonb_typeof(${t.mainReward}->'text') = 'string'`,
    ),
    check(
      "loyalty_programs_milestones_shape",
      sql`jsonb_typeof(${t.milestones}) = 'array' AND jsonb_array_length(${t.milestones}) <= 3`,
    ),
    check(
      "loyalty_programs_streak_shape",
      sql`${t.streak} IS NULL OR (jsonb_typeof(${t.streak}->'bonusGold') = 'number' AND (${t.streak}->>'bonusGold')::numeric BETWEEN 1 AND 500)`,
    ),
    check(
      "loyalty_programs_tiers_shape",
      sql`jsonb_typeof(${t.tiers}->'silver') = 'number' AND jsonb_typeof(${t.tiers}->'gold') = 'number' AND (${t.tiers}->>'silver')::numeric >= 1 AND (${t.tiers}->>'gold')::numeric > (${t.tiers}->>'silver')::numeric AND (${t.tiers}->>'gold')::numeric <= 1000`,
    ),
    check(
      "loyalty_programs_expiry_range",
      sql`${t.expiryMonths} IS NULL OR ${t.expiryMonths} BETWEEN 12 AND 60`,
    ),
    check("loyalty_programs_rewards_after_active", sql`${t.rewardsFrom} >= ${t.activeFrom}`),
  ],
);
