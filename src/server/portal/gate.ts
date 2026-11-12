import "server-only";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import {
  type AdminRoute,
  type AdminRouteRole,
  type CustomerRoute,
  type PortalRoute,
  routeByPath,
  type ShopRoute,
  type ShopRouteRole,
} from "@/features/portal/routes";
import {
  type AdminScope,
  type Principal,
  requireAdminRole,
  requireShopRole,
  type ShopScope,
} from "@/server/authz";
import { currentPrincipal } from "@/server/authz/principal";
import { env } from "@/server/env";
import { activeShopCookie } from "./active-shop";
import { decideRouteGate, type RouteGateDecision } from "./decide";

/**
 * Page gates (P0-12): the group layout **and** every page under it call one, with the page's own path as a
 * literal (it is the `returnTo`, and it picks the roles from the route table). Deny → `redirect()` (sign in,
 * enrol TOTP) or `forbidden()` (the 403 page); allow → the facts and scope the page needs. The decision is
 * `decideRouteGate` (pure, unit-tested); this file only does the I/O.
 *
 * `ctx` exists for the authz matrix (tests/authz/), like the `principal` argument of `require*`: pages never
 * pass it.
 */
type GateCtx = { principal?: Principal | null; shopCookie?: string };

/** One principal load per request, however many gates (layout + page) run. */
const requestPrincipal = cache(currentPrincipal);

async function readShopCookie(): Promise<string | undefined> {
  try {
    return (await cookies()).get(activeShopCookie(env().APP_URL).name)?.value;
  } catch {
    // Outside a request there are no cookies: no active shop chosen.
    return undefined;
  }
}

function routeOf<P extends PortalRoute["portal"]>(
  path: string,
  portal: P,
): Extract<PortalRoute, { portal: P }> {
  const route = routeByPath(path);
  // A programming error (a page passed a path that isn't in the table), never a request input.
  if (route?.portal !== portal) throw new Error(`gate: ${path} is not a ${portal} route`);
  return route as Extract<PortalRoute, { portal: P }>;
}

async function decide(
  route: PortalRoute,
  ctx: GateCtx,
): Promise<Extract<RouteGateDecision, { kind: "allow" }>> {
  const principal = ctx.principal === undefined ? await requestPrincipal() : ctx.principal;
  const shopCookie = "shopCookie" in ctx ? ctx.shopCookie : await readShopCookie();
  const d = decideRouteGate({
    route,
    principal,
    shopCookie,
    now: new Date(),
    allowlist: env().ADMIN_IP_ALLOWLIST,
  });
  if (d.kind === "redirect") redirect(d.to);
  if (d.kind === "forbidden") forbidden();
  return d;
}

/** Customer portal page: a visitor on a public page gets `null`; a signed-in page redirects visitors. */
export async function gateCustomerRoute(
  path: CustomerRoute["path"],
  ctx: GateCtx = {},
): Promise<Principal | null> {
  const d = await decide(routeOf(path, "customer"), ctx);
  return d.principal;
}

export async function gateShopRoute(
  path: ShopRoute["path"],
  ctx: GateCtx = {},
): Promise<{ principal: Principal; shopId: string; role: ShopRouteRole; scope: ShopScope }> {
  const route = routeOf(path, "shop");
  const d = await decide(route, ctx);
  if (!("shopId" in d)) throw new Error("gate: shop decision without a shop");
  // The scope comes from the same policy the actions use, so a page can only read what its role may.
  const scope = await requireShopRole(d.shopId, route.roles, d.principal);
  return { principal: d.principal, shopId: d.shopId, role: d.role, scope };
}

export async function gateAdminRoute(
  path: AdminRoute["path"],
  ctx: GateCtx = {},
): Promise<{ principal: Principal; role: AdminRouteRole; scope: AdminScope }> {
  const route = routeOf(path, "admin");
  const d = await decide(route, ctx);
  if (!("role" in d) || "shopId" in d) {
    throw new Error("gate: admin decision without a role");
  }
  const scope = await requireAdminRole(route.roles, d.principal);
  return { principal: d.principal, role: d.role, scope };
}
