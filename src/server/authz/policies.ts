import "server-only";
/**
 * Pure authorisation decisions (no I/O) so every role × action combination is unit-testable.
 * Deny by default. SECURITY.md §3.
 */
export type ShopRole = "owner" | "staff";
export type AdminRole = "owner" | "support" | "moderator" | "finance";

export type Principal = {
  userId: string;
  /** Session was created by TOTP/backup code/passkey verification. */
  mfaVerified: boolean;
  sessionCreatedAt: Date;
  /** Active staff memberships only. */
  shopRoles: ReadonlyArray<{ shopId: string; role: ShopRole }>;
  /** Active admin role, or null. */
  adminRole: AdminRole | null;
};

export type DenyReason = "unauthenticated" | "mfa_required" | "session_expired" | "forbidden";
export type Decision<T = undefined> = { ok: true; value: T } | { ok: false; reason: DenyReason };

export const STAFF_SESSION_MAX_MS = 12 * 60 * 60 * 1000;
export const ADMIN_SESSION_MAX_MS = 2 * 60 * 60 * 1000;

const allow = <T>(value: T): Decision<T> => ({ ok: true, value });
const deny = (reason: DenyReason): Decision<never> => ({ ok: false, reason });

export function decideCustomer(p: Principal | null): Decision<{ userId: string }> {
  if (!p) return deny("unauthenticated");
  return allow({ userId: p.userId });
}

export function decideShopRole(
  p: Principal | null,
  shopId: string,
  roles: ReadonlyArray<ShopRole>,
  now: Date = new Date(),
): Decision<{ userId: string; shopId: string; role: ShopRole }> {
  if (!p) return deny("unauthenticated");
  const membership = p.shopRoles.find((r) => r.shopId === shopId);
  if (!membership || !roles.includes(membership.role)) return deny("forbidden");
  if (!p.mfaVerified) return deny("mfa_required");
  if (now.getTime() - p.sessionCreatedAt.getTime() > STAFF_SESSION_MAX_MS) {
    return deny("session_expired");
  }
  return allow({ userId: p.userId, shopId, role: membership.role });
}

export function decideAdminRole(
  p: Principal | null,
  roles: ReadonlyArray<AdminRole>,
  now: Date = new Date(),
): Decision<{ userId: string; role: AdminRole }> {
  if (!p) return deny("unauthenticated");
  if (!p.adminRole || !roles.includes(p.adminRole)) return deny("forbidden");
  if (!p.mfaVerified) return deny("mfa_required");
  if (now.getTime() - p.sessionCreatedAt.getTime() > ADMIN_SESSION_MAX_MS) {
    return deny("session_expired");
  }
  return allow({ userId: p.userId, role: p.adminRole });
}

export const ALL_ADMIN_ROLES: ReadonlyArray<AdminRole> = [
  "owner",
  "support",
  "moderator",
  "finance",
];
export const ALL_SHOP_ROLES: ReadonlyArray<ShopRole> = ["owner", "staff"];
