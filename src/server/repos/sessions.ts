import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import type { CustomerScope, Scope } from "@/server/authz/scope";
import { sessions } from "@/server/db/schema";
import { dbFor, ownedBy } from "./_base";

/** Ends every session of a user (sign out everywhere, role change, test setup). Returns how many. */
export async function deleteUserSessions(scope: Scope, userId: string): Promise<number> {
  const rows = await dbFor(scope)
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return rows.length;
}

export type SessionSummary = {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastActiveAt: Date;
};

/**
 * The caller's own live sessions, most recently active first. Tokens and IP addresses are never selected:
 * the list is for recognising devices, and a token in a page would be a credential leak.
 */
export async function listOwnSessions(scope: CustomerScope, now: Date): Promise<SessionSummary[]> {
  return dbFor(scope)
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastActiveAt: sessions.updatedAt,
    })
    .from(sessions)
    .where(ownedBy(sessions.userId, scope, gt(sessions.expiresAt, now)))
    .orderBy(desc(sessions.updatedAt));
}

/** Ends one of the caller's own sessions. Returns false when it isn't theirs or no longer exists. */
export async function deleteOwnSession(scope: CustomerScope, sessionId: string): Promise<boolean> {
  const rows = await dbFor(scope)
    .delete(sessions)
    .where(and(ownedBy(sessions.userId, scope), eq(sessions.id, sessionId)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

/** Ends all of the caller's own sessions, this device included. Returns how many. */
export async function deleteAllOwnSessions(scope: CustomerScope): Promise<number> {
  const rows = await dbFor(scope)
    .delete(sessions)
    .where(ownedBy(sessions.userId, scope))
    .returning({ id: sessions.id });
  return rows.length;
}
