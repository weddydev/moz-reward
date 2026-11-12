import "server-only";
import { headers as requestHeaders } from "next/headers";
import { env } from "@/server/env";
import { testTokenPresent } from "@/server/testing/test-api";
import { type AdminAllowlist, parseAdminAllowlist } from "./admin-allowlist";
import { clientIp } from "./request";

/**
 * The two inputs of the admin IP allowlist (C-24) for one request: the client address and the list. Every
 * admin check reads them here: the page gates, `requireAdminRole`, the principal and the auth hooks.
 *
 * E2E override: only when APP_ENV=test **and** the request carries the test-API token (the same two walls as
 * the seeding API), `x-test-admin-allowlist` replaces the list and `x-test-client-ip` the address, per request,
 * so parallel E2E workers don't affect each other. In any other environment both headers are ignored.
 */
export const TEST_ADMIN_ALLOWLIST_HEADER = "x-test-admin-allowlist";
export const TEST_CLIENT_IP_HEADER = "x-test-client-ip";

export type AdminAccess = { ip: string; allowlist: AdminAllowlist | null };

export function adminAccessFrom(h: Headers | null): AdminAccess {
  const real: AdminAccess = {
    ip: h ? clientIp(h) : "unknown",
    allowlist: env().ADMIN_IP_ALLOWLIST,
  };
  if (!h || !testTokenPresent(h)) return real;
  const listText = h.get(TEST_ADMIN_ALLOWLIST_HEADER);
  const ipText = h.get(TEST_CLIENT_IP_HEADER);
  let allowlist = real.allowlist;
  if (listText !== null) {
    const parsed = parseAdminAllowlist(listText);
    if (!parsed.ok) throw new Error(`test admin allowlist: ${parsed.error}`);
    allowlist = parsed.list;
  }
  return { ip: ipText ?? real.ip, allowlist };
}

/** For server components and actions: the current request's values ("unknown" address outside a request). */
export async function currentAdminAccess(): Promise<AdminAccess> {
  try {
    return adminAccessFrom(await requestHeaders());
  } catch {
    return adminAccessFrom(null);
  }
}
