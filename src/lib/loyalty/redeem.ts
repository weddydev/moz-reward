/**
 * Reward redemption rules (P1-16; PRODUCT §6 "Redemption", §15 state matrix; SECURITY §6). Pure: callers pass
 * the instant in. The database enforces the same rules (migration 0034); this module is what the services,
 * views and tests share.
 */
import { formatDate } from "@/lib/format-date";
import { addDays, londonDate, londonInstant } from "@/lib/time";

const DAY_MS = 86_400_000;

export const REDEEM = {
  /** Code length and alphabet size (`CODE_ALPHABET`, 30 symbols): 30^6 codes. */
  codeLength: 6,
  codeSpace: 30 ** 6,
  /** A code lives 15 minutes (PRODUCT §6). */
  codeValidMs: 15 * 60_000,
  /** Reward validity in days from unlock: 90 unless the shop sets longer (≤ 365, DECISIONS 27 Nov). */
  validDays: { default: 90, min: 90, max: 365 },
  /** A closed shop still redeems for 30 days after closing (PRODUCT §15). */
  closedRedeemMs: 30 * DAY_MS,
  /**
   * Per shop, the sum over wrong-code attempts in any 24 h of the live codes the shop had at each attempt.
   * P(guessing any live code in a day) ≤ that sum / codeSpace (union bound), so 700 keeps it under 1 in
   * 1,000,000 (729 would be the bound itself).
   */
  shopGuessBudget: 700,
} as const;

/** The chance that attempts with this summed weight guessed some live code (union bound). */
export const guessChance = (weight: number): number => weight / REDEEM.codeSpace;

/**
 * When a reward unlocked at `unlockedAt` stops being redeemable: the end of the London day `days` days after
 * the unlock's London date (so "valid until 2 Apr 2027" holds all of 2 Apr, across clock changes).
 */
export function rewardExpiresAt(unlockedAt: Date, days: number): Date {
  if (!Number.isInteger(days) || days < REDEEM.validDays.min || days > REDEEM.validDays.max)
    throw new RangeError(
      `reward validity must be ${REDEEM.validDays.min}–${REDEEM.validDays.max} days`,
    );
  const lastDay = addDays(londonDate(unlockedAt), days);
  return new Date(londonInstant(Date.parse(`${addDays(lastDay, 1)}T00:00:00Z`)));
}

/** The last London date a reward is valid on (YYYY-MM-DD), for "Valid until 2 Apr 2027". */
export const validUntilDate = (expiresAt: Date): string =>
  londonDate(new Date(expiresAt.getTime() - 1));

/** "Valid until 2 Apr 2027" (customer copy, CLAUDE.md §5). */
export const validUntilLabel = (expiresAt: Date): string =>
  `Valid until ${formatDate(new Date(expiresAt.getTime() - 1))}`;

export type RewardState = "ready" | "expired" | "redeemed";

export function rewardState(
  reward: { expiresAt: Date; redeemedAt: Date | null },
  now: Date,
): RewardState {
  if (reward.redeemedAt) return "redeemed";
  return now.getTime() < reward.expiresAt.getTime() ? "ready" : "expired";
}

export type ShopStatus =
  "pending" | "active" | "expiring" | "grace" | "restricted" | "suspended" | "closed";

/**
 * Can rewards be redeemed at this shop now (PRODUCT §15)? Active, expiring, grace and restricted: yes;
 * suspended: no (validity paused, P2-12); closed: for 30 days after closing; pending: no.
 */
export function shopRedeemable(
  shop: { status: ShopStatus; closedAt: Date | null },
  now: Date,
): boolean {
  switch (shop.status) {
    case "active":
    case "expiring":
    case "grace":
    case "restricted":
      return true;
    case "closed":
      return (
        shop.closedAt !== null && now.getTime() - shop.closedAt.getTime() < REDEEM.closedRedeemMs
      );
    case "pending":
    case "suspended":
      return false;
  }
}
