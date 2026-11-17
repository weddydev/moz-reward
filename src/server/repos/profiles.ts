import "server-only";
import { sql } from "drizzle-orm";
import { CodeCollisionError, SHOP_CODE_LENGTH, generateCode } from "@/lib/codes";
import type { CustomerScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { customerProfiles } from "@/server/db/schema";
import { opsAlert } from "@/server/security/alert";
import { openField, sealField } from "@/server/security/field-crypto";
import { fieldKeyring, phoneBlindIndex, profilePhoneContext } from "@/server/security/field-keys";
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

const MEMBER_ID_ATTEMPTS = 5;

export type NewProfile = {
  fullName: string;
  /** E.164, already validated as a UK mobile (`parseUkMobile`). */
  phoneE164: string;
  birthday: { day: number; month: number } | null;
};

export type OwnProfile = {
  fullName: string;
  memberId: string;
  /** Plaintext: only ever returned to the profile's owner (SECURITY §7). */
  phoneE164: string | null;
  birthday: { day: number; month: number } | null;
};

/** The caller's member ID, or null when they have no profile yet (join flow: profile step needed). */
export async function ownMemberId(scope: CustomerScope, tx?: Transaction): Promise<string | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({ memberId: customerProfiles.memberId })
        .from(customerProfiles)
        .where(ownedBy(customerProfiles.userId, scope))
        .limit(1),
    tx,
  );
  return row?.memberId ?? null;
}

/** The caller's own profile with the phone decrypted (an unknown key id or a failed tag throws, loudly). */
export async function readOwnProfile(
  scope: CustomerScope,
  tx?: Transaction,
): Promise<OwnProfile | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          fullName: customerProfiles.fullName,
          memberId: customerProfiles.memberId,
          phoneEnc: customerProfiles.phoneEnc,
          phoneKeyId: customerProfiles.phoneKeyId,
          day: customerProfiles.birthdayDay,
          month: customerProfiles.birthdayMonth,
        })
        .from(customerProfiles)
        .where(ownedBy(customerProfiles.userId, scope))
        .limit(1),
    tx,
  );
  if (!row) return null;
  const phoneE164 =
    row.phoneEnc && row.phoneKeyId
      ? openField(
          fieldKeyring(),
          { keyId: row.phoneKeyId, ciphertext: row.phoneEnc },
          profilePhoneContext(scope.userId),
        )
      : null;
  return {
    fullName: row.fullName,
    memberId: row.memberId,
    phoneE164,
    birthday: row.day && row.month ? { day: row.day, month: row.month } : null,
  };
}

/**
 * Creates the caller's profile once (P1-04): member ID generated here and never changed (DB trigger), phone
 * sealed under the current data key with a blind index, `age_declared_at` = now (the 13+ tick). Parallel
 * first joins: `ON CONFLICT DO NOTHING`, then a re-select tells "another request created it" (its profile
 * wins, this input is discarded, never merged) from "the member ID collided" (retry with a new one). A unique
 * violation would abort the whole transaction, so collisions never raise.
 * Returns the member ID and whether this call created the profile.
 */
export async function createOwnProfile(
  scope: CustomerScope,
  input: NewProfile,
  tx: Transaction,
  opts: { /** Tests only: force member-ID collisions. */ generate?: () => string } = {},
): Promise<{ memberId: string; created: boolean }> {
  const sealed = sealField(fieldKeyring(), input.phoneE164, profilePhoneContext(scope.userId));
  const phoneHash = phoneBlindIndex(input.phoneE164);
  const next = opts.generate ?? (() => generateCode(SHOP_CODE_LENGTH));
  return withScope(
    scope,
    async (q) => {
      for (let attempt = 1; attempt <= MEMBER_ID_ATTEMPTS; attempt++) {
        const [row] = await q
          .insert(customerProfiles)
          .values({
            userId: scope.userId,
            fullName: input.fullName,
            phoneEnc: sealed.ciphertext,
            phoneKeyId: sealed.keyId,
            phoneHash,
            birthdayDay: input.birthday?.day ?? null,
            birthdayMonth: input.birthday?.month ?? null,
            memberId: next(),
            ageDeclaredAt: sql`now()`,
          })
          .onConflictDoNothing()
          .returning({ memberId: customerProfiles.memberId });
        if (row) return { memberId: row.memberId, created: true };
        const [existing] = await q
          .select({ memberId: customerProfiles.memberId })
          .from(customerProfiles)
          .where(ownedBy(customerProfiles.userId, scope))
          .limit(1);
        if (existing) return { memberId: existing.memberId, created: false };
      }
      opsAlert("codes.exhausted", { kind: "member_id", attempts: MEMBER_ID_ATTEMPTS });
      throw new CodeCollisionError(MEMBER_ID_ATTEMPTS);
    },
    tx,
  );
}
