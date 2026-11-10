import "server-only";
import { eq } from "drizzle-orm";
import type { AdminScope, Scope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { featureFlags } from "@/server/db/schema";
import { withScope } from "./_base";

/** Feature flags are global configuration: anyone authorised (or the system) may read them. */
export async function findFlagEnabled(scope: Scope, key: string): Promise<boolean | undefined> {
  const [row] = await withScope(scope, (q) =>
    q.select({ enabled: featureFlags.enabled }).from(featureFlags).where(eq(featureFlags.key, key)),
  );
  return row?.enabled;
}

/** Only an admin scope may change a flag; the caller records the audit entry in the same transaction. */
export async function upsertFlag(
  scope: AdminScope,
  input: { key: string; enabled: boolean; description: string },
  tx?: Transaction,
): Promise<void> {
  await withScope(
    scope,
    (q) =>
      q
        .insert(featureFlags)
        .values({ ...input, updatedBy: scope.userId })
        .onConflictDoUpdate({
          target: featureFlags.key,
          set: { enabled: input.enabled, updatedBy: scope.userId },
        }),
    tx,
  );
}
