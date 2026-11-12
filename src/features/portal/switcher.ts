import { type Portal, PORTAL_ROOT } from "./routes";

/**
 * The role switcher (C-02, PRODUCT §2: "a user can be a customer and also staff of a shop; separate role
 * contexts, explicit switch in UI"). Every signed-in user has the customer app; shop staff also get the shop
 * dashboard, admins the admin portal. Built from the principal's **active** roles (inactive memberships are not
 * on a principal). Navigation only: the target's gate decides.
 */
export type PortalLink = { portal: Portal; href: string; label: string };

export const PORTAL_LABEL: Record<Portal, string> = {
  customer: "Customer app",
  shop: "Shop dashboard",
  admin: "Admin",
};

export function portalLinks(roles: {
  adminRole: string | null;
  shopRoles: readonly unknown[];
}): PortalLink[] {
  const links: PortalLink[] = [];
  if (roles.adminRole)
    links.push({ portal: "admin", href: PORTAL_ROOT.admin, label: PORTAL_LABEL.admin });
  if (roles.shopRoles.length > 0) {
    links.push({ portal: "shop", href: PORTAL_ROOT.shop, label: PORTAL_LABEL.shop });
  }
  links.push({ portal: "customer", href: PORTAL_ROOT.customer, label: PORTAL_LABEL.customer });
  // One portal means nothing to switch to.
  return links.length > 1 ? links : [];
}
