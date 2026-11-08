import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_MAX_MS,
  type Principal,
  STAFF_SESSION_MAX_MS,
  decideAdminRole,
  decideCustomer,
  decideShopRole,
} from "./policies";

const NOW = new Date("2026-11-08T12:00:00Z");
const SHOP_A = "shop-a";
const SHOP_B = "shop-b";

const principal = (over: Partial<Principal> = {}): Principal => ({
  userId: "u1",
  mfaVerified: true,
  sessionCreatedAt: new Date(NOW.getTime() - 60_000),
  shopRoles: [],
  adminRole: null,
  ...over,
});

describe("decideCustomer", () => {
  it("denies anonymous", () => {
    expect(decideCustomer(null)).toEqual({ ok: false, reason: "unauthenticated" });
  });
  it("allows any signed-in user (no MFA needed for customers)", () => {
    expect(decideCustomer(principal({ mfaVerified: false }))).toEqual({
      ok: true,
      value: { userId: "u1" },
    });
  });
});

describe("decideShopRole", () => {
  const staffA = principal({ shopRoles: [{ shopId: SHOP_A, role: "staff" }] });
  const ownerA = principal({ shopRoles: [{ shopId: SHOP_A, role: "owner" }] });

  it("denies anonymous", () => {
    expect(decideShopRole(null, SHOP_A, ["staff"], NOW)).toMatchObject({
      reason: "unauthenticated",
    });
  });
  it("denies staff of another shop (cross-shop access)", () => {
    expect(decideShopRole(staffA, SHOP_B, ["owner", "staff"], NOW)).toMatchObject({
      reason: "forbidden",
    });
  });
  it("denies customers with no staff role", () => {
    expect(decideShopRole(principal(), SHOP_A, ["owner", "staff"], NOW)).toMatchObject({
      reason: "forbidden",
    });
  });
  it("denies staff on owner-only actions", () => {
    expect(decideShopRole(staffA, SHOP_A, ["owner"], NOW)).toMatchObject({ reason: "forbidden" });
  });
  it("denies admins who are not shop staff (admins use view-as-shop, read-only)", () => {
    expect(decideShopRole(principal({ adminRole: "owner" }), SHOP_A, ["owner"], NOW)).toMatchObject(
      {
        reason: "forbidden",
      },
    );
  });
  it("requires an MFA-verified session", () => {
    expect(decideShopRole({ ...ownerA, mfaVerified: false }, SHOP_A, ["owner"], NOW)).toMatchObject(
      {
        reason: "mfa_required",
      },
    );
  });
  it("expires staff sessions after 12 h", () => {
    const old = { ...ownerA, sessionCreatedAt: new Date(NOW.getTime() - STAFF_SESSION_MAX_MS - 1) };
    expect(decideShopRole(old, SHOP_A, ["owner"], NOW)).toMatchObject({
      reason: "session_expired",
    });
    const edge = { ...ownerA, sessionCreatedAt: new Date(NOW.getTime() - STAFF_SESSION_MAX_MS) };
    expect(decideShopRole(edge, SHOP_A, ["owner"], NOW).ok).toBe(true);
  });
  it("allows own-shop staff and owner with the matching role", () => {
    expect(decideShopRole(staffA, SHOP_A, ["owner", "staff"], NOW)).toEqual({
      ok: true,
      value: { userId: "u1", shopId: SHOP_A, role: "staff" },
    });
    expect(decideShopRole(ownerA, SHOP_A, ["owner"], NOW).ok).toBe(true);
  });
});

describe("decideAdminRole", () => {
  it("denies anonymous and non-admins", () => {
    expect(decideAdminRole(null, ["owner"], NOW)).toMatchObject({ reason: "unauthenticated" });
    expect(
      decideAdminRole(
        principal({ shopRoles: [{ shopId: SHOP_A, role: "owner" }] }),
        ["owner"],
        NOW,
      ),
    ).toMatchObject({ reason: "forbidden" });
  });
  it("denies admin roles not in the allow list", () => {
    expect(
      decideAdminRole(principal({ adminRole: "moderator" }), ["owner", "finance"], NOW),
    ).toMatchObject({
      reason: "forbidden",
    });
  });
  it("requires MFA and expires after 2 h", () => {
    const admin = principal({ adminRole: "support" });
    expect(decideAdminRole({ ...admin, mfaVerified: false }, ["support"], NOW)).toMatchObject({
      reason: "mfa_required",
    });
    const old = { ...admin, sessionCreatedAt: new Date(NOW.getTime() - ADMIN_SESSION_MAX_MS - 1) };
    expect(decideAdminRole(old, ["support"], NOW)).toMatchObject({ reason: "session_expired" });
  });
  it("allows a matching admin role", () => {
    expect(decideAdminRole(principal({ adminRole: "finance" }), ["finance"], NOW)).toEqual({
      ok: true,
      value: { userId: "u1", role: "finance" },
    });
  });
});
