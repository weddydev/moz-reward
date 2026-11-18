/**
 * Strict validation of the loyalty settings form (P1-05, ENGINEERING §4 step 2). The server action is the
 * control; the form shows the field errors it returns. Limits come from `LIMITS` in `src/lib/loyalty/programme.ts`
 * and match the CHECK constraints of migration 0024.
 */
import { z } from "zod";
import {
  EARN_MODES,
  LIMITS,
  MILESTONE_PERCENTS,
  type ProgrammeRules,
  rulesOf,
} from "@/lib/loyalty/programme";

/** Same rule as names (P1-04 L10): hidden characters are refused, not stripped. */
const HIDDEN = /[\p{Cc}\p{Cf}]/u;
const VISIBLE = /[\p{L}\p{N}£$€%]/u;

const rewardText = (what: string) =>
  z
    .string()
    .max(200)
    .transform((raw, ctx) => {
      const nfc = raw.normalize("NFC");
      if (HIDDEN.test(nfc)) {
        ctx.addIssue({
          code: "custom",
          message: `The ${what} contains a hidden character. Please type it again.`,
        });
        return z.NEVER;
      }
      const value = nfc.trim().replace(/\s+/gu, " ");
      const length = Array.from(value).length;
      if (!VISIBLE.test(value) || length < LIMITS.rewardText.min) {
        ctx.addIssue({ code: "custom", message: `Please describe the ${what}.` });
        return z.NEVER;
      }
      if (length > LIMITS.rewardText.max) {
        ctx.addIssue({
          code: "custom",
          message: `Please keep the ${what} to ${String(LIMITS.rewardText.max)} characters.`,
        });
        return z.NEVER;
      }
      return value;
    });

const whole = (min: number, max: number, what: string) =>
  z
    .number({ error: `Please enter ${what}.` })
    .int(`Please enter ${what} as a whole number.`)
    .min(min, `${capitalise(what)} must be at least ${min.toLocaleString("en-GB")}.`)
    .max(max, `${capitalise(what)} can be at most ${max.toLocaleString("en-GB")}.`);

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const milestone = z
  .object({
    percent: z.union(MILESTONE_PERCENTS.map((p) => z.literal(p))),
    reward: rewardText("milestone reward"),
    isMystery: z.boolean(),
  })
  .strict();

export const programmeRulesInput = z
  .object({
    earnMode: z.enum(EARN_MODES),
    earnRate: z.number().int(),
    ingotSize: whole(LIMITS.ingotSize.min, LIMITS.ingotSize.max, "the ingot size"),
    mainReward: z.object({ text: rewardText("main reward") }).strict(),
    milestones: z.array(milestone).max(MILESTONE_PERCENTS.length, "Up to 3 milestones."),
    streak: z
      .object({
        bonusGold: whole(LIMITS.streakBonus.min, LIMITS.streakBonus.max, "the streak bonus"),
      })
      .strict()
      .nullable(),
    tiers: z
      .object({
        silver: whole(LIMITS.tier.min, LIMITS.tier.max - 1, "the Silver threshold"),
        gold: whole(LIMITS.tier.min + 1, LIMITS.tier.max, "the Gold threshold"),
      })
      .strict(),
    expiryMonths: whole(
      LIMITS.expiryMonths.min,
      LIMITS.expiryMonths.max,
      "the expiry period",
    ).nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const rate = LIMITS.earnRate[r.earnMode];
    const unit = r.earnMode === "per_visit" ? "per visit" : "per £1";
    if (r.earnRate < rate.min || r.earnRate > rate.max) {
      ctx.addIssue({
        code: "custom",
        path: ["earnRate"],
        message: `Gold ${unit} must be between ${String(rate.min)} and ${String(rate.max)}.`,
      });
    }
    const seen = new Set<number>();
    r.milestones.forEach((m, i) => {
      if (seen.has(m.percent)) {
        ctx.addIssue({
          code: "custom",
          path: ["milestones", i, "percent"],
          message: `There is already a milestone at ${String(m.percent)}%.`,
        });
      }
      seen.add(m.percent);
    });
    if (r.tiers.gold <= r.tiers.silver) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers", "gold"],
        message: "Gold needs more ingots than Silver.",
      });
    }
  })
  .transform((r): ProgrammeRules => rulesOf(r));

export const saveProgrammeInput = z
  .object({
    shopId: z.uuid(),
    /** The version the owner edited (0 = no programme yet): a stale form gets CONFLICT, never overwrites. */
    baseVersion: z.number().int().min(0).max(1_000_000),
    rules: programmeRulesInput,
  })
  .strict();
