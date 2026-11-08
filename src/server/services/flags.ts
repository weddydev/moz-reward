import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { featureFlags } from "@/server/db/schema";
import { recordAudit } from "./audit";

/** Known flags (ARCHITECTURE §3). Env override: FLAG_<KEY>=true|false wins over the DB. */
export const FLAGS = {
  ai_review_help: "AI help when writing a review",
  google_business_replies: "Reply to Google reviews via Business Profile API",
  game_rewards: "Shop rewards for Stack the Gold scores",
} as const;
export type FlagKey = keyof typeof FLAGS;
export const FLAG_KEYS = Object.keys(FLAGS) as [FlagKey, ...FlagKey[]];

export function envOverride(
  key: FlagKey,
  source: NodeJS.ProcessEnv = process.env,
): boolean | undefined {
  const raw = source[`FLAG_${key.toUpperCase()}`]?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return undefined;
}

export async function isEnabled(key: FlagKey): Promise<boolean> {
  const forced = envOverride(key);
  if (forced !== undefined) return forced;
  const [row] = await db()
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.key, key));
  return row?.enabled ?? false;
}

export async function setFlag(input: {
  key: FlagKey;
  enabled: boolean;
  actorId: string;
  actorRole: string;
}): Promise<{ key: FlagKey; enabled: boolean }> {
  return db().transaction(async (tx) => {
    await tx
      .insert(featureFlags)
      .values({
        key: input.key,
        enabled: input.enabled,
        description: FLAGS[input.key],
        updatedBy: input.actorId,
      })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { enabled: input.enabled, updatedBy: input.actorId, updatedAt: new Date() },
      });
    await recordAudit(tx, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: "feature_flag.set",
      entity: "feature_flag",
      entityId: input.key,
      meta: { enabled: input.enabled },
    });
    return { key: input.key, enabled: input.enabled };
  });
}
