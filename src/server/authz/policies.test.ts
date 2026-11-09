import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_MAX_MS,
  type Principal,
  STAFF_SESSION_MAX_MS,
  decideAdminRole,
  decideCustomer,
  decideShopRole,
  decideStaffAwardLimit,
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

describe("[P0-07] decideCustomer", () => {
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

describe("[P0-07] decideShopRole", () => {
  const staffA = principal({ shopRoles: [{ shopId: SHOP_A, role: "staff", perAwardLimit: null }] });
  const ownerA = principal({ shopRoles: [{ shopId: SHOP_A, role: "owner", perAwardLimit: null }] });

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

describe("[P0-07] decideAdminRole", () => {
  it("denies anonymous and non-admins", () => {
    expect(decideAdminRole(null, ["owner"], NOW)).toMatchObject({ reason: "unauthenticated" });
    expect(
      decideAdminRole(
        principal({ shopRoles: [{ shopId: SHOP_A, role: "owner", perAwardLimit: null }] }),
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

describe("[P0-07] decideStaffAwardLimit (SECURITY §3: per-award limit enforced server-side)", () => {
  const staff = (perAwardLimit: number | null) =>
    principal({ shopRoles: [{ shopId: SHOP_A, role: "staff", perAwardLimit }] });

  it("allows staff up to and including their limit", () => {
    expect(decideStaffAwardLimit(staff(50), SHOP_A, 50, NOW)).toEqual({
      ok: true,
      value: { userId: "u1", shopId: SHOP_A, role: "staff" },
    });
    expect(decideStaffAwardLimit(staff(50), SHOP_A, 1, NOW).ok).toBe(true);
  });

  it("denies staff one point over their limit (owner approval needed)", () => {
    expect(decideStaffAwardLimit(staff(50), SHOP_A, 51, NOW)).toEqual({
      ok: false,
      reason: "over_limit",
    });
  });

  it("owners and staff without a limit set have no cap", () => {
    const owner = principal({ shopRoles: [{ shopId: SHOP_A, role: "owner", perAwardLimit: 5 }] });
    expect(decideStaffAwardLimit(owner, SHOP_A, 10_000, NOW).ok).toBe(true);
    expect(decideStaffAwardLimit(staff(null), SHOP_A, 10_000, NOW).ok).toBe(true);
  });

  it("keeps every shop-role rule: anonymous, other shop, no MFA, stale session", () => {
    expect(decideStaffAwardLimit(null, SHOP_A, 1, NOW)).toMatchObject({
      reason: "unauthenticated",
    });
    expect(decideStaffAwardLimit(staff(50), SHOP_B, 1, NOW)).toMatchObject({ reason: "forbidden" });
    expect(
      decideStaffAwardLimit({ ...staff(50), mfaVerified: false }, SHOP_A, 1, NOW),
    ).toMatchObject({ reason: "mfa_required" });
    const old = {
      ...staff(50),
      sessionCreatedAt: new Date(NOW.getTime() - STAFF_SESSION_MAX_MS - 1),
    };
    expect(decideStaffAwardLimit(old, SHOP_A, 1, NOW)).toMatchObject({ reason: "session_expired" });
  });

  it("refuses amounts that are not a positive whole number of points", () => {
    for (const points of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decideStaffAwardLimit(staff(null), SHOP_A, points, NOW), String(points)).toMatchObject(
        {
          reason: "forbidden",
        },
      );
    }
  });
});
