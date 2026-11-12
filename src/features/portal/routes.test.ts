import { describe, expect, it } from "vitest";
import {
  ADMIN_ROUTES,
  CUSTOMER_ROUTES,
  PORTAL_ROUTES,
  SHOP_ROUTES,
  activeRoute,
  defaultPortalPath,
  navFor,
  routeByPath,
} from "./routes";

describe("[P0-12] portal route table", () => {
  it("shop: every PRODUCT §14 item, in order, plus Scan (mobile nav)", () => {
    expect(SHOP_ROUTES.filter((r) => r.nav !== "mobile-only").map((r) => r.label)).toEqual([
      "Overview",
      "Requests",
      "Customers",
      "Suggestions",
      "Offers",
      "Announcements",
      "Loyalty programme",
      "Feedback",
      "Analytics",
      "QR & NFC kit",
      "Staff",
      "Settings",
    ]);
    expect(routeByPath("/dashboard/scan")?.portal).toBe("shop");
  });

  it("admin: every PRODUCT §16 item, in order, plus System (P0-13)", () => {
    expect(ADMIN_ROUTES.map((r) => r.label)).toEqual([
      "Overview",
      "Applications",
      "Shops",
      "Plans & payments",
      "QR & NFC",
      "Customers",
      "Moderation",
      "Fraud monitor",
      "Featured slots",
      "Content settings",
      "Broadcasts",
      "Audit log",
      "Team",
      "System",
    ]);
  });

  it("customer: Wallet, Offers, Scan, Market, Me and Notifications; only Offers and Market are public", () => {
    expect(CUSTOMER_ROUTES.map((r) => r.path)).toEqual([
      "/wallet",
      "/offers",
      "/scan",
      "/market",
      "/me",
      "/notifications",
    ]);
    expect(CUSTOMER_ROUTES.filter((r) => r.access === "public").map((r) => r.path)).toEqual([
      "/offers",
      "/market",
    ]);
  });

  it("paths are unique, lower-case, and sit under their portal's root", () => {
    const paths = PORTAL_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of PORTAL_ROUTES) {
      expect(r.path).toMatch(/^\/[a-z0-9/-]+$/);
      if (r.portal === "shop")
        expect(r.path === "/dashboard" || r.path.startsWith("/dashboard/")).toBe(true);
      if (r.portal === "admin")
        expect(r.path === "/admin" || r.path.startsWith("/admin/")).toBe(true);
    }
  });

  it("every shop and admin route names at least one role, and owners can open all of them", () => {
    for (const r of [...SHOP_ROUTES, ...ADMIN_ROUTES]) {
      expect(r.roles.length, r.path).toBeGreaterThan(0);
      expect(r.roles, r.path).toContain("owner");
    }
  });

  it("role matrix (brief): shop staff can't open Staff or Settings", () => {
    const staffCant = SHOP_ROUTES.filter((r) => !r.roles.includes("staff")).map((r) => r.label);
    expect(staffCant).toEqual(["Staff", "Settings"]);
  });

  it("role matrix (brief): admin roles", () => {
    const open = (role: "support" | "moderator" | "finance") =>
      ADMIN_ROUTES.filter((r) => r.roles.includes(role)).map((r) => r.label);
    expect(open("support")).toEqual([
      "Overview",
      "Applications",
      "Shops",
      "QR & NFC",
      "Customers",
      "Fraud monitor",
    ]);
    expect(open("moderator")).toEqual([
      "Overview",
      "Moderation",
      "Fraud monitor",
      "Content settings",
    ]);
    expect(open("finance")).toEqual(["Overview", "Plans & payments", "Featured slots"]);
  });

  it("navFor hides what the role can't open (the page gate is still the control)", () => {
    expect(navFor("shop", "staff").map((r) => r.label)).not.toContain("Settings");
    expect(navFor("shop", "owner").map((r) => r.label)).toContain("Settings");
    expect(navFor("admin", "finance").map((r) => r.label)).toEqual([
      "Overview",
      "Plans & payments",
      "Featured slots",
    ]);
    expect(navFor("customer", null).map((r) => r.label)).toContain("Wallet");
  });

  it("mobile bottom navs match DESIGN §5", () => {
    const mobile = (portal: "customer" | "shop" | "admin", role: "owner" | null) =>
      navFor(portal, role)
        .filter((r) => r.mobile)
        .map((r) => r.mobileLabel ?? r.label);
    expect(mobile("customer", null)).toEqual(["Wallet", "Offers", "Scan", "Market", "Me"]);
    expect(mobile("shop", "owner")).toEqual(["Home", "Requests", "Scan", "Customers"]);
    expect(mobile("admin", "owner")).toEqual(["Overview", "Applications", "Shops", "Moderation"]);
  });

  it("activeRoute: the longest matching route; a portal root only matches itself", () => {
    expect(activeRoute("/dashboard")?.path).toBe("/dashboard");
    expect(activeRoute("/dashboard/customers")?.path).toBe("/dashboard/customers");
    expect(activeRoute("/dashboard/customers/abc")?.path).toBe("/dashboard/customers");
    expect(activeRoute("/admin/shops/123/payments")?.path).toBe("/admin/shops");
    expect(activeRoute("/dashboard/unknown")).toBeNull();
    expect(activeRoute("/dashboardx")).toBeNull();
    expect(activeRoute("/wallet/")?.path).toBe("/wallet");
    expect(activeRoute("/")).toBeNull();
  });

  it("defaultPortalPath: admin first, then shop, else the wallet; from active roles only", () => {
    expect(defaultPortalPath({ adminRole: "support", shopRoles: [{}] })).toBe("/admin");
    expect(defaultPortalPath({ adminRole: null, shopRoles: [{}] })).toBe("/dashboard");
    expect(defaultPortalPath({ adminRole: null, shopRoles: [] })).toBe("/wallet");
  });
});
