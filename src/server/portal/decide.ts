import "server-only";
import {
  activeRoute,
  type AdminRouteRole,
  type Portal,
  PORTAL_ROOT,
  type PortalRoute,
  routeByPath,
  type ShopRouteRole,
} from "@/features/portal/routes";
import { safeReturnTo } from "@/lib/return-to";
import {
  type Decision,
  type Principal,
  decideAdminRole,
  decideShopRole,
} from "@/server/authz/policies";
import type { AdminAllowlist } from "@/server/security/admin-allowlist";

/**
 * The page gate's decision for one portal route (P0-12 design, docs/phases/P0.md). Pure, so every role ×
 * session state × route is unit-tested; `gate.ts` turns it into `redirect()` / `forbidden()`.
 *
 * Order: session first (signed out or past the role's session limit → sign in, never 403), then the active
 * shop (no membership → 403), then the role via the same `decide*` policies the actions use. MFA missing →
 * `/staff/security`; past the session limit → `/staff/sign-in?returnTo`. A 403 never says which role a route
 * needs. `returnTo` is the route's own path from the table, never anything from the request.
 */
export type RouteGateDecision =
  | { kind: "allow"; principal: Principal | null }
  | { kind: "allow"; principal: Principal; shopId: string; role: ShopRouteRole }
  | { kind: "allow"; principal: Principal; role: AdminRouteRole }
  | { kind: "redirect"; to: string }
  | { kind: "forbidden" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The shop a request acts on: the cookie's shop when it is one of the principal's **active** memberships
 * (never authority by itself), else the first membership in a fixed order (owner before staff, then shop
 * id), else null.
 */
export function pickActiveShop(
  shopRoles: Principal["shopRoles"],
  cookie: string | undefined,
): string | null {
  if (cookie !== undefined && UUID.test(cookie)) {
    const hit = shopRoles.find((r) => r.shopId === cookie.toLowerCase());
    if (hit) return hit.shopId;
  }
  const ordered = [...shopRoles].sort(
    (a, b) =>
      Number(b.role === "owner") - Number(a.role === "owner") ||
      (a.shopId < b.shopId ? -1 : a.shopId > b.shopId ? 1 : 0),
  );
  return ordered[0]?.shopId ?? null;
}

const signIn = (base: "/sign-in" | "/staff/sign-in", path: string): string =>
  `${base}?returnTo=${encodeURIComponent(safeReturnTo(path))}`;

function fromDenied(d: Exclude<Decision<unknown>, { ok: true }>, path: string): RouteGateDecision {
  switch (d.reason) {
    case "mfa_required":
      return { kind: "redirect", to: "/staff/security" };
    case "unauthenticated":
    case "session_expired":
      return { kind: "redirect", to: signIn("/staff/sign-in", path) };
    case "forbidden":
    case "over_limit":
      return { kind: "forbidden" };
  }
}

export function decideRouteGate(input: {
  route: PortalRoute;
  principal: Principal | null;
  /** Raw active-shop cookie value, if any. */
  shopCookie: string | undefined;
  now: Date;
  allowlist: AdminAllowlist | null;
}): RouteGateDecision {
  const { route, principal: p, now } = input;
  switch (route.portal) {
    case "customer":
      if (route.access === "public") return { kind: "allow", principal: p };
      if (!p) return { kind: "redirect", to: signIn("/sign-in", route.path) };
      return { kind: "allow", principal: p };
    case "shop": {
      if (!p) return { kind: "redirect", to: signIn("/staff/sign-in", route.path) };
      const shopId = pickActiveShop(p.shopRoles, input.shopCookie);
      if (shopId === null) return { kind: "forbidden" };
      const d = decideShopRole(p, shopId, route.roles, now);
      if (!d.ok) return fromDenied(d, route.path);
      return { kind: "allow", principal: p, shopId, role: d.value.role };
    }
    case "admin": {
      if (!p) return { kind: "redirect", to: signIn("/staff/sign-in", route.path) };
      const d = decideAdminRole(p, route.roles, now, input.allowlist);
      if (!d.ok) return fromDenied(d, route.path);
      return { kind: "allow", principal: p, role: d.value.role };
    }
  }
}
/**
 * The route a portal's group layout gates (P0-12). The proxy forwards the request path as `x-pathname`
 * (overwriting any client value); the layout gates the **table route** that path belongs to, so a deny lands
 * above the loading boundary as a real 403 / 307, and the path used (incl. `returnTo`) is the table's literal,
 * never the header's text. A missing header (prefetches skip the proxy) or a path outside this portal falls
 * back to the portal root (every role of the portal) for shop and admin, and to no layout gate for the
 * customer portal, whose public pages share the layout. The page gate is the control in every case.
 */
export function layoutRoute(portal: Portal, pathname: string | null): PortalRoute | null {
  const hit = pathname ? activeRoute(pathname) : null;
  if (hit?.portal === portal) return hit;
  if (portal === "customer") return null;
  return routeByPath(PORTAL_ROOT[portal]) ?? null;
}
