import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/return-to";
import { getAuth, type Auth } from "./auth";
import { sessionPastRoleLimit } from "./privileged";

/** The signed-in user and session, as Better Auth infers them from our config (incl. mfaVerified). */
export type AuthSession = Auth["$Infer"]["Session"];

/**
 * The session for a set of request headers, or null. Staff sessions end after 12 h and admin sessions after 2 h
 * (SECURITY §2) even though the row itself lives longer: past that, the caller is signed out everywhere in the
 * app (pages, actions via currentPrincipal), not only in the shop/admin policies.
 */
export async function sessionFromHeaders(h: Headers): Promise<AuthSession | null> {
  const session = await getAuth().api.getSession({ headers: h });
  if (!session) return null;
  if (await sessionPastRoleLimit(session.user.id, new Date(session.session.createdAt))) return null;
  return session;
}

/** Session for the current request (null when signed out). */
export async function getSession(): Promise<AuthSession | null> {
  return sessionFromHeaders(await headers());
}

export async function requireSessionOrRedirect(returnTo: string): Promise<AuthSession> {
  const session = await getSession();
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return session;
}
