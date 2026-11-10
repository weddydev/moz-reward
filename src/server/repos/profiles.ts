import "server-only";
import type { CustomerScope } from "@/server/authz/scope";
import { customerProfiles } from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";

/** Display preferences kept in the customer profile; null = no choice (motion follows the system, sounds on). */
export type ProfilePreferences = { reduceMotion: boolean | null; soundOn: boolean | null };

/** The caller's own preferences, or null when the account has no customer profile (staff, admin). */
export async function ownPreferences(scope: CustomerScope): Promise<ProfilePreferences | null> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({ reduceMotion: customerProfiles.reduceMotion, soundOn: customerProfiles.soundOn })
      .from(customerProfiles)
      .where(ownedBy(customerProfiles.userId, scope))
      .limit(1),
  );
  return row ?? null;
}

/** Saves the caller's own preferences. Returns false when the account has no customer profile. */
export async function updateOwnPreferences(
  scope: CustomerScope,
  values: ProfilePreferences,
): Promise<boolean> {
  const rows = await withScope(scope, (q) =>
    q
      .update(customerProfiles)
      .set({ reduceMotion: values.reduceMotion, soundOn: values.soundOn })
      .where(ownedBy(customerProfiles.userId, scope))
      .returning({ userId: customerProfiles.userId }),
  );
  return rows.length > 0;
}
