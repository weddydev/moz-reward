import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { safeReturnTo } from "@/lib/return-to";
import { auth } from "./auth";

/** Raw Better Auth session for the current request (null when signed out). Read behind <Suspense>. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSessionOrRedirect(returnTo: string) {
  const session = await getSession();
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return session;
}
