import "server-only";
import { eq } from "drizzle-orm";
import type { SystemScope } from "@/server/authz/scope";
import { users } from "@/server/db/schema";
import { poolFor } from "./_base";

/**
 * Users read by background jobs (P0-18). System scope only: the job acts for no signed-in user, and the
 * scope (plus, from P0-20, the worker role under RLS) is what lets it read the row.
 */
export async function userEmailById(scope: SystemScope, userId: string): Promise<string | null> {
  const [row] = await poolFor(scope)
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}
