import "server-only";
import { eq } from "drizzle-orm";
import type { Scope } from "@/server/authz/scope";
import { sessions } from "@/server/db/schema";
import { dbFor } from "./_base";

/** Ends every session of a user (sign out everywhere, role change, test setup). Returns how many. */
export async function deleteUserSessions(scope: Scope, userId: string): Promise<number> {
  const rows = await dbFor(scope)
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return rows.length;
}
