import "server-only";
import type { Portal } from "@/features/portal/routes";
import type { ShellProps } from "@/features/portal/shell/types";
import { portalLinks } from "@/features/portal/switcher";
import { ALL_SHOP_ROLES, type Principal, requireShopRole } from "@/server/authz";
import { log, serializeError } from "@/server/log";
import { countAwaitingOwner } from "@/server/repos/point-requests";
import { type ShopSummary, shopSummary } from "@/server/repos/shops";
import { REQUEST_TTL_MS } from "@/server/services/point-request-jobs";

/**
 * What a portal shell shows around the page (P0-12): the role switcher's portals and, in the shop portal,
 * the user's shops for the shop switcher, each read under its own membership's scope. Built by the group
 * layout after its gate allowed the request. Navigation only: every page still runs its own gate.
 */
async function memberShops(principal: Principal): Promise<ShopSummary[]> {
  const rows = await Promise.all(
    principal.shopRoles.map(async ({ shopId }) => {
      try {
        return await shopSummary(await requireShopRole(shopId, ALL_SHOP_ROLES, principal));
      } catch (err) {
        // A membership that can't be read is left out of the switcher; the gate is unaffected.
        log().warn({ err: serializeError(err), shopId }, "portal shell: shop summary unavailable");
        return null;
      }
    }),
  );
  return rows
    .filter((r): r is ShopSummary => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

/**
 * The nav counts (route path → number): an owner sees how many requests wait for them on Requests (P1-12
 * "dashboard badge", code review M3). Kept live by the layout's shop stream (`router.refresh()` re-renders the
 * layout). A read that fails shows no count; the page is unaffected.
 */
async function navCounts(
  portal: Portal,
  gate: { principal: Principal | null; shopId?: string; role?: string },
): Promise<Record<string, number>> {
  const { principal, shopId } = gate;
  if (portal !== "shop" || gate.role !== "owner" || !principal || !shopId) return {};
  try {
    const scope = await requireShopRole(shopId, ["owner"], principal);
    const n = await countAwaitingOwner(scope, {
      requestedAfter: new Date(Date.now() - REQUEST_TTL_MS),
    });
    return n > 0 ? { "/dashboard/requests": n } : {};
  } catch (err) {
    log().warn(
      { err: serializeError(err), shopId },
      "portal shell: awaiting-owner count unavailable",
    );
    return {};
  }
}

export async function shellChrome(
  portal: Portal,
  gate: { principal: Principal | null; shopId?: string; role?: string },
): Promise<ShellProps> {
  const { principal } = gate;
  const [shops, counts] = await Promise.all([
    portal === "shop" && principal ? memberShops(principal) : [],
    navCounts(portal, gate),
  ]);
  return {
    portal,
    signedIn: principal !== null,
    portals: principal ? portalLinks(principal) : [],
    shops,
    counts,
    // P2-02: the owner's count is the Awaiting owner tab, so the item opens that tab.
    targets: counts["/dashboard/requests"]
      ? { "/dashboard/requests": "/dashboard/requests?tab=awaiting" }
      : {},
    activeShopId: gate.shopId ?? null,
    role: portal === "customer" ? null : (gate.role ?? null),
  };
}
