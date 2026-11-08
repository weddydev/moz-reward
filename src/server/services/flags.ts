import "server-only";
import { type AdminScope, auditActor, systemScope } from "@/server/authz/scope";
import { transaction } from "@/server/repos/_base";
import { findFlagEnabled, upsertFlag } from "@/server/repos/flags";
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

const FLAG_READ = systemScope("feature flags are global configuration, readable by every request");

export async function isEnabled(key: FlagKey): Promise<boolean> {
  const forced = envOverride(key);
  if (forced !== undefined) return forced;
  return (await findFlagEnabled(FLAG_READ, key)) ?? false;
}

/** Admin toggles a flag; the change and its audit row commit together. */
export async function setFlag(
  scope: AdminScope,
  input: { key: FlagKey; enabled: boolean },
): Promise<{ key: FlagKey; enabled: boolean }> {
  return transaction(scope, async (tx) => {
    await upsertFlag(scope, { ...input, description: FLAGS[input.key] }, tx);
    await recordAudit(tx, {
      ...auditActor(scope),
      action: "feature_flag.set",
      entity: "feature_flag",
      entityId: input.key,
      meta: { enabled: input.enabled },
    });
    return { key: input.key, enabled: input.enabled };
  });
}
