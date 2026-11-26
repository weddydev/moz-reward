/**
 * Member QR verify limits (P1-14, SECURITY §6; design check M4): per team member per shop, and per shop. Both
 * fail closed. Same shape as the Requests decisions (features/requests/actions.ts); a busy shop's ceiling is
 * revisited with the P2 scanner, when real counter traffic is known.
 */
export const VERIFY_LIMITS = {
  // 180 an hour: below the shop's 300, so one account can't lock the counter out (security review M1).
  member: { max: 30, windowSec: 600 },
  shop: { max: 300, windowSec: 3600 },
} as const;
