import "server-only";
import { and, gt, inArray, sql } from "drizzle-orm";
import { ADMIN_SESSION_MAX_MS, STAFF_SESSION_MAX_MS } from "@/server/authz/policies";
import { authScope } from "@/server/authz/scope";
import { sessions } from "@/server/db/schema";
import { poolFor } from "@/server/repos/_base";
import { privilegedKind } from "./privileged";

/**
 * Session facts for long-lived realtime streams (P1-10, ARCHITECTURE §7). The stream hub re-checks every open
 * stream's session on each heartbeat in **one** query for the whole process, so a signed-out, revoked or
 * expired session (incl. every session a role change deletes, migration 0006) loses its stream within one
 * heartbeat, at a cost that does not grow with the number of streams.
 */
const STREAMS = authScope("realtime: are the sessions behind open streams still valid");

/** Postgres caps bind parameters; the hub's id list is chunked well below that. */
const CHUNK = 1_000;

/** The subset of `sessionIds` that still exist and have not expired. */
export async function validStreamSessions(sessionIds: string[]): Promise<Set<string>> {
  const valid = new Set<string>();
  const ids = sessionIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await poolFor(STREAMS)
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(inArray(sessions.id, ids.slice(i, i + CHUNK)), gt(sessions.expiresAt, sql`now()`)),
      );
    for (const r of rows) valid.add(r.id);
  }
  return valid;
}

/**
 * When a stream must close even if its session row lives on: staff sessions end after 12 h and admin sessions
 * after 2 h (SECURITY §2, the same rule as `sessionPastRoleLimit`). Customers have no role limit here: their
 * session's own expiry is checked by `validStreamSessions`.
 */
export async function streamDeadline(userId: string, sessionCreatedAt: Date): Promise<number> {
  const kind = await privilegedKind(userId, STREAMS);
  const created = sessionCreatedAt.getTime();
  if (kind === "admin") return created + ADMIN_SESSION_MAX_MS;
  if (kind === "staff") return created + STAFF_SESSION_MAX_MS;
  return Number.POSITIVE_INFINITY;
}
