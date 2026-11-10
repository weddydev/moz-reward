import { getAuth } from "@/server/auth/auth";
import { isAllowedAuthRequest } from "@/server/auth/routes";
import { authRequestLimit } from "@/server/security/auth-limit";

const BASE = "/api/auth";

/**
 * Better Auth behind a blanket per-IP limit and a reviewed allowlist (P0-19). Every request counts towards
 * the limit (unknown paths too, so probing isn't free); only the method + path pairs in
 * src/server/auth/routes.ts reach the library, anything else is a 404 here. The instance is resolved per
 * request so `next build` never needs runtime secrets (P0-14).
 */
const handler = async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url);
  const path = pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length) : "";
  const limited = await authRequestLimit(request, path);
  if (limited) return limited;
  if (!isAllowedAuthRequest(request.method, path))
    return new Response("Not Found", { status: 404 });
  return getAuth().handler(request);
};

export { handler as GET, handler as POST };
