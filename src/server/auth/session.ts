import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/return-to";
import { auth } from "./auth";

/** The signed-in user and session, as Better Auth infers them from our config (incl. mfaVerified). */
export type AuthSession = typeof auth.$Infer.Session;

/** Raw Better Auth session for the current request (null when signed out). Read behind <Suspense>. */
export async function getSession(): Promise<AuthSession | null> {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSessionOrRedirect(returnTo: string): Promise<AuthSession> {
  const session = await getSession();
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return session;
}
