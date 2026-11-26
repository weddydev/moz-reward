import "server-only";
import { cookies } from "next/headers";
import { currentPrincipal } from "@/server/authz/principal";
import { cardOwnerTag } from "@/server/services/member-qr";
import { CardCacheGuard } from "./CardCacheGuard";

/**
 * Root layout part (streams after the shell): tells the browser whose member card may stay cached. A request
 * without a session cookie costs no query. A failed session read keeps the cache (owner unknown: no guard).
 */
export async function CardOwnerGuard(): Promise<React.JSX.Element | null> {
  const jar = await cookies();
  if (!jar.getAll().some((c) => c.name.endsWith(".session_token"))) {
    return <CardCacheGuard owner={null} />;
  }
  let owner: string | null;
  try {
    const p = await currentPrincipal();
    owner = p ? cardOwnerTag(p.userId) : null;
  } catch {
    return null;
  }
  return <CardCacheGuard owner={owner} />;
}
