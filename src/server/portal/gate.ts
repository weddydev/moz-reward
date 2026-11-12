import "server-only";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import {
  type AdminRoute,
  type AdminRouteRole,
  type CustomerRoute,
  defaultPortalPath,
  type Portal,
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
import { currentAdminAccess } from "@/server/security/admin-access";
import { activeShopCookie } from "./active-shop";
import { decideRouteGate, layoutRoute, type RouteGateDecision } from "./decide";

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
    allowlist: (await currentAdminAccess()).allowlist,
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

/**
 * Group layout gate: `(shop)/layout.tsx`, `(admin)/layout.tsx` and `(customer)/layout.tsx` call it before
 * rendering any shell, so a portal-level deny renders no portal shell or nav. Returns what the shell needs
 * (the principal and, for shop/admin, the role and active shop). Pages still call their own gate.
 */
export async function gatePortalLayout(portal: Portal): Promise<{
  principal: Principal | null;
  shopId?: string;
  role?: ShopRouteRole | AdminRouteRole;
}> {
  let pathname: string | null = null;
  try {
    pathname = (await headers()).get("x-pathname");
  } catch {
    pathname = null;
  }
  const route = layoutRoute(portal, pathname);
  if (!route) return { principal: await requestPrincipal() };
  return decide(route, {});
}

/**
 * Where a signed-in staff member or admin opening a sign-in page should go instead (C-05), or null to show
 * the form: their default portal, only when that portal's gate would let this session in. A session without
 * MFA or past its role's limit sees the form (redirecting it would bounce straight back here).
 */
export async function signedInStaffDestination(): Promise<string | null> {
  const principal = await requestPrincipal();
  if (!principal || (!principal.adminRole && principal.shopRoles.length === 0)) return null;
  const path = defaultPortalPath(principal);
  const route = routeByPath(path);
  if (!route) return null;
  const d = decideRouteGate({
    route,
    principal,
    shopCookie: await readShopCookie(),
    now: new Date(),
    allowlist: (await currentAdminAccess()).allowlist,
  });
  return d.kind === "allow" ? path : null;
}
