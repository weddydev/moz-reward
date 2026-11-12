/**
 * The one table of portal routes (P0-12). The navigation, the page gates (`src/server/portal/gate.ts`) and
 * the authz matrix (`tests/authz/`) are all built from it, so a route can't have a nav item without a gate
 * or a gate without a matrix entry. Shared by server and client code: no imports from `@/server`.
 *
 * Nav order follows PRODUCT §14 (shop) and §16 (admin); mobile bottom navs follow DESIGN §5.
 * Hiding an item from a role's nav is a courtesy. The gate on the page is the control.
 */
export type Portal = "customer" | "shop" | "admin";
export type ShopRouteRole = "owner" | "staff";
export type AdminRouteRole = "owner" | "support" | "moderator" | "finance";

type Base = {
  path: `/${string}`;
  label: string;
  /** Lucide icon name, resolved in the nav component. */
  icon: string;
  /** Shown in the mobile bottom nav (the rest sit under "More"). */
  mobile?: true;
  /** Bottom-nav label when it differs from the sidebar label. */
  mobileLabel?: string;
  /** "mobile-only": not in the desktop sidebar or rail. */
  nav?: "mobile-only";
};
export type CustomerRoute = Base & {
  portal: "customer";
  /** "public": visitors may open it (PRODUCT §2). "signed-in": needs a session. */
  access: "public" | "signed-in";
};
export type ShopRoute = Base & { portal: "shop"; roles: readonly ShopRouteRole[] };
export type AdminRoute = Base & { portal: "admin"; roles: readonly AdminRouteRole[] };
export type PortalRoute = CustomerRoute | ShopRoute | AdminRoute;

const SHOP_ALL = ["owner", "staff"] as const;
const SHOP_OWNER = ["owner"] as const;

export const CUSTOMER_ROUTES: readonly CustomerRoute[] = [
  {
    portal: "customer",
    path: "/wallet",
    label: "Wallet",
    icon: "Wallet",
    access: "signed-in",
    mobile: true,
  },
  {
    portal: "customer",
    path: "/offers",
    label: "Offers",
    icon: "Tag",
    access: "public",
    mobile: true,
  },
  {
    portal: "customer",
    path: "/scan",
    label: "Scan",
    icon: "ScanLine",
    access: "signed-in",
    mobile: true,
    nav: "mobile-only",
  },
  {
    portal: "customer",
    path: "/market",
    label: "Market",
    icon: "Store",
    access: "public",
    mobile: true,
  },
  {
    portal: "customer",
    path: "/me",
    label: "Me",
    icon: "CircleUser",
    access: "signed-in",
    mobile: true,
  },
  {
    portal: "customer",
    path: "/notifications",
    label: "Notifications",
    icon: "Bell",
    access: "signed-in",
  },
];

export const SHOP_ROUTES: readonly ShopRoute[] = [
  {
    portal: "shop",
    path: "/dashboard",
    label: "Overview",
    mobileLabel: "Home",
    icon: "LayoutDashboard",
    roles: SHOP_ALL,
    mobile: true,
  },
  {
    portal: "shop",
    path: "/dashboard/requests",
    label: "Requests",
    icon: "Inbox",
    roles: SHOP_ALL,
    mobile: true,
  },
  {
    portal: "shop",
    path: "/dashboard/scan",
    label: "Scan",
    icon: "ScanLine",
    roles: SHOP_ALL,
    mobile: true,
    nav: "mobile-only",
  },
  {
    portal: "shop",
    path: "/dashboard/customers",
    label: "Customers",
    icon: "Users",
    roles: SHOP_ALL,
    mobile: true,
  },
  {
    portal: "shop",
    path: "/dashboard/suggestions",
    label: "Suggestions",
    icon: "Lightbulb",
    roles: SHOP_ALL,
  },
  { portal: "shop", path: "/dashboard/offers", label: "Offers", icon: "Tag", roles: SHOP_ALL },
  {
    portal: "shop",
    path: "/dashboard/announcements",
    label: "Announcements",
    icon: "Megaphone",
    roles: SHOP_ALL,
  },
  {
    portal: "shop",
    path: "/dashboard/loyalty",
    label: "Loyalty programme",
    icon: "Gem",
    roles: SHOP_ALL,
  },
  {
    portal: "shop",
    path: "/dashboard/feedback",
    label: "Feedback",
    icon: "MessageSquare",
    roles: SHOP_ALL,
  },
  {
    portal: "shop",
    path: "/dashboard/analytics",
    label: "Analytics",
    icon: "ChartLine",
    roles: SHOP_ALL,
  },
  {
    portal: "shop",
    path: "/dashboard/kit",
    label: "QR & NFC kit",
    icon: "QrCode",
    roles: SHOP_ALL,
  },
  { portal: "shop", path: "/dashboard/staff", label: "Staff", icon: "UserCog", roles: SHOP_OWNER },
  {
    portal: "shop",
    path: "/dashboard/settings",
    label: "Settings",
    icon: "Settings",
    roles: SHOP_OWNER,
  },
];

/** PRODUCT §2 is silent on QR & NFC and the Fraud monitor: DECISIONS 12 Nov 2026 (P0-12 role matrix). */
export const ADMIN_ROUTES: readonly AdminRoute[] = [
  {
    portal: "admin",
    path: "/admin",
    label: "Overview",
    icon: "LayoutDashboard",
    roles: ["owner", "support", "moderator", "finance"],
    mobile: true,
  },
  {
    portal: "admin",
    path: "/admin/applications",
    label: "Applications",
    icon: "FileCheck",
    roles: ["owner", "support"],
    mobile: true,
  },
  {
    portal: "admin",
    path: "/admin/shops",
    label: "Shops",
    icon: "Store",
    roles: ["owner", "support"],
    mobile: true,
  },
  {
    portal: "admin",
    path: "/admin/plans",
    label: "Plans & payments",
    icon: "CreditCard",
    roles: ["owner", "finance"],
  },
  {
    portal: "admin",
    path: "/admin/qr-nfc",
    label: "QR & NFC",
    icon: "QrCode",
    roles: ["owner", "support"],
  },
  {
    portal: "admin",
    path: "/admin/customers",
    label: "Customers",
    icon: "Users",
    roles: ["owner", "support"],
  },
  {
    portal: "admin",
    path: "/admin/moderation",
    label: "Moderation",
    icon: "ShieldCheck",
    roles: ["owner", "moderator"],
    mobile: true,
  },
  {
    portal: "admin",
    path: "/admin/fraud",
    label: "Fraud monitor",
    icon: "TriangleAlert",
    roles: ["owner", "support", "moderator"],
  },
  {
    portal: "admin",
    path: "/admin/featured",
    label: "Featured slots",
    icon: "Star",
    roles: ["owner", "finance"],
  },
  {
    portal: "admin",
    path: "/admin/content",
    label: "Content settings",
    icon: "SlidersHorizontal",
    roles: ["owner", "moderator"],
  },
  {
    portal: "admin",
    path: "/admin/broadcasts",
    label: "Broadcasts",
    icon: "Megaphone",
    roles: ["owner"],
  },
  {
    portal: "admin",
    path: "/admin/audit",
    label: "Audit log",
    icon: "ScrollText",
    roles: ["owner"],
  },
  { portal: "admin", path: "/admin/team", label: "Team", icon: "UserCog", roles: ["owner"] },
  { portal: "admin", path: "/admin/system", label: "System", icon: "Activity", roles: ["owner"] },
];

export const PORTAL_ROUTES: readonly PortalRoute[] = [
  ...CUSTOMER_ROUTES,
  ...SHOP_ROUTES,
  ...ADMIN_ROUTES,
];

export const PORTAL_ROOT = { customer: "/wallet", shop: "/dashboard", admin: "/admin" } as const;

export function routeByPath(path: string): PortalRoute | undefined {
  return PORTAL_ROUTES.find((r) => r.path === path);
}

/** The nav items a role may open in a portal, in table order. `role` is ignored for the customer portal. */
export function navFor(portal: "customer", role: null): readonly CustomerRoute[];
export function navFor(portal: "shop", role: ShopRouteRole): readonly ShopRoute[];
export function navFor(portal: "admin", role: AdminRouteRole): readonly AdminRoute[];
export function navFor(
  portal: Portal,
  role: ShopRouteRole | AdminRouteRole | null,
): readonly PortalRoute[];
export function navFor(
  portal: Portal,
  role: ShopRouteRole | AdminRouteRole | null,
): readonly PortalRoute[] {
  return PORTAL_ROUTES.filter((r) => {
    if (r.portal !== portal) return false;
    if (r.portal === "customer") return true;
    return role !== null && (r.roles as readonly string[]).includes(role);
  });
}

/**
 * The route a pathname belongs to, for the active nav state: the longest route path that equals it or is a
 * parent segment of it. A portal root (`/dashboard`, `/admin`) matches only itself, or every page under it
 * would light up "Overview".
 */
export function activeRoute(pathname: string): PortalRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const roots: readonly string[] = Object.values(PORTAL_ROOT);
  let best: PortalRoute | null = null;
  for (const r of PORTAL_ROUTES) {
    const exact = r.path === path;
    const parent = !roots.includes(r.path) && path.startsWith(`${r.path}/`);
    if ((exact || parent) && (!best || r.path.length > best.path.length)) best = r;
  }
  return best;
}

/**
 * Where a user lands by default (C-02): admins in the admin portal, shop staff in their dashboard, everyone
 * else in the wallet. Pass the principal's **active** roles (inactive memberships are not on a principal).
 */
export function defaultPortalPath(roles: {
  adminRole: string | null;
  shopRoles: readonly unknown[];
}): "/admin" | "/dashboard" | "/wallet" {
  if (roles.adminRole) return PORTAL_ROOT.admin;
  if (roles.shopRoles.length > 0) return PORTAL_ROOT.shop;
  return PORTAL_ROOT.customer;
}
