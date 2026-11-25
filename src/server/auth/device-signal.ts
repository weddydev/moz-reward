import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authScope } from "@/server/authz/scope";
import { sessions } from "@/server/db/schema";
import { poolFor } from "@/server/repos/_base";

/**
 * Device signal for the fraud rules (P1-12, PRODUCT §5 "same-device flag", COMPLIANCE §2.8: fraud and security
 * only). Session rows live in the identity layer, so the comparison runs here and only a count leaves it: no
 * IP address or user agent is returned, logged or stored by the caller.
 */
const DEVICE_SIGNAL = authScope("fraud rules: did two accounts use the same device lately");

/**
 * How far back a session counts as "seen". Not only live sessions: an expired session row still shows the device
 * was used (signing out deletes the row, so that gap goes to P4-08's own device signals, CARRIED_LATER).
 */
export const DEVICE_LOOKBACK_DAYS = 30;

/**
 * How many pairs of sessions of `userA` and `userB`, each active within the lookback, share both IP address and
 * user agent. A session without either value never matches (NULL = NULL is not a match). One statement.
 */
export async function sharedDeviceSessions(userA: string, userB: string): Promise<number> {
  if (userA === userB) return 0;
  const b = alias(sessions, "b");
  const since = sql`now() - make_interval(days => ${DEVICE_LOOKBACK_DAYS})`;
  const [row] = await poolFor(DEVICE_SIGNAL)
    .select({ n: count() })
    .from(sessions)
    .innerJoin(b, and(eq(b.ipAddress, sessions.ipAddress), eq(b.userAgent, sessions.userAgent)))
    .where(
      and(
        eq(sessions.userId, userA),
        eq(b.userId, userB),
        gte(sessions.updatedAt, since),
        gte(b.updatedAt, since),
      ),
    );
  return row?.n ?? 0;
}
