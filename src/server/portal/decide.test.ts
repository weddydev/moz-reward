import { describe, expect, it } from "vitest";
import { ADMIN_ROUTES, CUSTOMER_ROUTES, routeByPath, SHOP_ROUTES } from "@/features/portal/routes";
import {
  ADMIN_SESSION_MAX_MS,
  type Principal,
  STAFF_SESSION_MAX_MS,
} from "@/server/authz/policies";
import { parseAdminAllowlist } from "@/server/security/admin-allowlist";
import { decideRouteGate, layoutRoute, pickActiveShop } from "./decide";

const NOW = new Date("2026-11-12T12:00:00Z");
const SHOP_A = "0b8a9c2e-1d3f-4a5b-8c6d-7e8f9a0b1c2d";
const SHOP_B = "1c9b0d3f-2e4a-4b6c-9d7e-8f9a0b1c2d3e";

const principal = (over: Partial<Principal> = {}): Principal => ({
  userId: "u1",
  mfaVerified: true,
  sessionCreatedAt: new Date(NOW.getTime() - 60_000),
  shopRoles: [],
  adminRole: null,
  clientIp: "203.0.113.7",
  ...over,
});
const staffOf = (shopId: string) => ({ shopId, role: "staff" as const, perAwardLimit: 50 });
const ownerOf = (shopId: string) => ({ shopId, role: "owner" as const, perAwardLimit: null });

const route = (path: string) => {
  const r = routeByPath(path);
  if (!r) throw new Error(`no route ${path}`);
  return r;
};
const decide = (
  path: string,
  p: Principal | null,
  opts: { shopCookie?: string; allowlist?: string } = {},
) => {
  const parsed = parseAdminAllowlist(opts.allowlist);
  if (!parsed.ok) throw new Error(parsed.error);
  return decideRouteGate({
    route: route(path),
    principal: p,
    shopCookie: opts.shopCookie,
    now: NOW,
    allowlist: parsed.list,
  });
};

describe("[P0-12] pickActiveShop", () => {
  it("keeps a cookie that names one of the principal's shops", () => {
    expect(pickActiveShop([staffOf(SHOP_A), ownerOf(SHOP_B)], SHOP_A)).toBe(SHOP_A);
  });
  it("ignores a cookie for a shop the user was removed from (falls back)", () => {
    expect(pickActiveShop([staffOf(SHOP_B)], SHOP_A)).toBe(SHOP_B);
  });
  it("ignores a malformed cookie", () => {
    expect(pickActiveShop([staffOf(SHOP_A)], "x'; DROP")).toBe(SHOP_A);
  });
  it("without a usable cookie: owner memberships first, then by shop id (fixed order)", () => {
    expect(pickActiveShop([staffOf(SHOP_A), ownerOf(SHOP_B)], undefined)).toBe(SHOP_B);
    expect(pickActiveShop([staffOf(SHOP_B), staffOf(SHOP_A)], undefined)).toBe(SHOP_A);
  });
  it("zero memberships → null", () => {
    expect(pickActiveShop([], SHOP_A)).toBeNull();
  });
});

describe("[P0-12] decideRouteGate: customer routes", () => {
  it("public routes (/offers, /market) open for visitors and signed-in users", () => {
    for (const path of ["/offers", "/market"]) {
      expect(decide(path, null)).toEqual({ kind: "allow", principal: null });
      expect(decide(path, principal())).toMatchObject({ kind: "allow" });
    }
  });
  it("signed-in routes redirect a visitor to /sign-in with this page as returnTo", () => {
    for (const r of CUSTOMER_ROUTES.filter((c) => c.access === "signed-in")) {
      expect(decide(r.path, null)).toEqual({
        kind: "redirect",
        to: `/sign-in?returnTo=${encodeURIComponent(r.path)}`,
      });
    }
  });
  it("any signed-in user may open them, MFA or not (customers have no second factor)", () => {
    const p = principal({ mfaVerified: false });
    expect(decide("/wallet", p)).toEqual({ kind: "allow", principal: p });
  });
});

describe("[P0-12] decideRouteGate: shop routes", () => {
  it("signed out → /staff/sign-in?returnTo, never 403", () => {
    for (const r of SHOP_ROUTES) {
      expect(decide(r.path, null)).toEqual({
        kind: "redirect",
        to: `/staff/sign-in?returnTo=${encodeURIComponent(r.path)}`,
      });
    }
  });
  it("zero shop memberships (a customer) → 403", () => {
    expect(decide("/dashboard", principal())).toEqual({ kind: "forbidden" });
  });
  it("member without TOTP → /staff/security (C-01)", () => {
    expect(
      decide("/dashboard", principal({ mfaVerified: false, shopRoles: [staffOf(SHOP_A)] })),
    ).toEqual({ kind: "redirect", to: "/staff/security" });
  });
  it("session older than 12 h → /staff/sign-in?returnTo (C-01, stale)", () => {
    const p = principal({
      shopRoles: [ownerOf(SHOP_A)],
      sessionCreatedAt: new Date(NOW.getTime() - STAFF_SESSION_MAX_MS - 1),
    });
    expect(decide("/dashboard/settings", p)).toEqual({
      kind: "redirect",
      to: `/staff/sign-in?returnTo=${encodeURIComponent("/dashboard/settings")}`,
    });
  });
  it("staff may open shared items but not owner-only ones (Staff, Settings)", () => {
    const p = principal({ shopRoles: [staffOf(SHOP_A)] });
    expect(decide("/dashboard/requests", p)).toEqual({
      kind: "allow",
      principal: p,
      shopId: SHOP_A,
      role: "staff",
    });
    expect(decide("/dashboard/staff", p)).toEqual({ kind: "forbidden" });
    expect(decide("/dashboard/settings", p)).toEqual({ kind: "forbidden" });
  });
  it("a member without TOTP on an item their role can't open gets 403, not the enrolment path", () => {
    const p = principal({ mfaVerified: false, shopRoles: [staffOf(SHOP_A)] });
    expect(decide("/dashboard/settings", p)).toEqual({ kind: "forbidden" });
  });
  it("the active shop decides: staff here, owner elsewhere → owner items are 403 until they switch", () => {
    const p = principal({ shopRoles: [staffOf(SHOP_A), ownerOf(SHOP_B)] });
    expect(decide("/dashboard/settings", p, { shopCookie: SHOP_A })).toEqual({ kind: "forbidden" });
    expect(decide("/dashboard/settings", p, { shopCookie: SHOP_B })).toMatchObject({
      kind: "allow",
      shopId: SHOP_B,
      role: "owner",
    });
  });
  it("a cookie naming another user's shop grants nothing (falls back to an own shop)", () => {
    const p = principal({ shopRoles: [staffOf(SHOP_A)] });
    expect(decide("/dashboard", p, { shopCookie: SHOP_B })).toMatchObject({
      kind: "allow",
      shopId: SHOP_A,
    });
  });
  it("an admin with no shop membership gets 403 on the shop portal", () => {
    expect(decide("/dashboard", principal({ adminRole: "owner" }))).toEqual({ kind: "forbidden" });
  });
});

describe("[P0-12] decideRouteGate: admin routes", () => {
  it("signed out → /staff/sign-in?returnTo", () => {
    for (const r of ADMIN_ROUTES) {
      expect(decide(r.path, null)).toEqual({
        kind: "redirect",
        to: `/staff/sign-in?returnTo=${encodeURIComponent(r.path)}`,
      });
    }
  });
  it("each admin route allows exactly the roles in the table", () => {
    for (const r of ADMIN_ROUTES) {
      for (const role of ["owner", "support", "moderator", "finance"] as const) {
        const d = decide(r.path, principal({ adminRole: role }));
        expect(d.kind, `${r.path} as ${role}`).toBe(
          (r.roles as readonly string[]).includes(role) ? "allow" : "forbidden",
        );
      }
    }
  });
  it("shop staff and customers get 403", () => {
    expect(decide("/admin", principal({ shopRoles: [ownerOf(SHOP_A)] }))).toEqual({
      kind: "forbidden",
    });
    expect(decide("/admin", principal())).toEqual({ kind: "forbidden" });
  });
  it("admin without TOTP → /staff/security; past 2 h → sign in again", () => {
    expect(decide("/admin", principal({ adminRole: "owner", mfaVerified: false }))).toEqual({
      kind: "redirect",
      to: "/staff/security",
    });
    const stale = principal({
      adminRole: "owner",
      sessionCreatedAt: new Date(NOW.getTime() - ADMIN_SESSION_MAX_MS - 1),
    });
    expect(decide("/admin/audit", stale)).toEqual({
      kind: "redirect",
      to: `/staff/sign-in?returnTo=${encodeURIComponent("/admin/audit")}`,
    });
  });
  it("C-24: with an allowlist, an off-list address gets 403 (even without TOTP) and an on-list one passes", () => {
    const allowlist = "198.51.100.0/24";
    expect(decide("/admin", principal({ adminRole: "owner" }), { allowlist })).toEqual({
      kind: "forbidden",
    });
    expect(
      decide("/admin", principal({ adminRole: "owner", mfaVerified: false }), { allowlist }),
    ).toEqual({ kind: "forbidden" });
    expect(
      decide("/admin", principal({ adminRole: "owner", clientIp: "::ffff:198.51.100.9" }), {
        allowlist,
      }),
    ).toMatchObject({ kind: "allow", role: "owner" });
    expect(
      decide("/admin", principal({ adminRole: "owner", clientIp: "unknown" }), { allowlist }),
    ).toEqual({ kind: "forbidden" });
  });
});
describe("[P0-12] layoutRoute", () => {
  it("gates the table route the path belongs to (deeper paths → their parent item)", () => {
    expect(layoutRoute("shop", "/dashboard/settings")?.path).toBe("/dashboard/settings");
    expect(layoutRoute("shop", "/dashboard/customers/42")?.path).toBe("/dashboard/customers");
    expect(layoutRoute("admin", "/admin/system")?.path).toBe("/admin/system");
  });
  it("missing header, unknown path or another portal's path → the portal root", () => {
    expect(layoutRoute("shop", null)?.path).toBe("/dashboard");
    expect(layoutRoute("shop", "/dashboard/nope")?.path).toBe("/dashboard");
    expect(layoutRoute("admin", "/dashboard/settings")?.path).toBe("/admin");
  });
  it("customer layout: its own routes, else no layout gate (public pages share it)", () => {
    expect(layoutRoute("customer", "/wallet")?.path).toBe("/wallet");
    expect(layoutRoute("customer", "/offers")?.path).toBe("/offers");
    expect(layoutRoute("customer", null)).toBeNull();
    expect(layoutRoute("customer", "/admin")).toBeNull();
  });
  it("the returnTo of a layout deny is the table path, never the raw header", () => {
    const r = layoutRoute("shop", "/dashboard/customers/%2F%2Fevil.example");
    expect(r?.path).toBe("/dashboard/customers");
  });
});
