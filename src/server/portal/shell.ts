import "server-only";
import type { Portal } from "@/features/portal/routes";
import type { ShellProps } from "@/features/portal/shell/types";
import { portalLinks } from "@/features/portal/switcher";
import { ALL_SHOP_ROLES, type Principal, requireShopRole } from "@/server/authz";
import { log, serializeError } from "@/server/log";
import { type ShopSummary, shopSummary } from "@/server/repos/shops";

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

export async function shellChrome(
  portal: Portal,
  gate: { principal: Principal | null; shopId?: string; role?: string },
): Promise<ShellProps> {
  const { principal } = gate;
  return {
    portal,
    signedIn: principal !== null,
    portals: principal ? portalLinks(principal) : [],
    shops: portal === "shop" && principal ? await memberShops(principal) : [],
    activeShopId: gate.shopId ?? null,
    role: portal === "customer" ? null : (gate.role ?? null),
  };
}
