import "server-only";
import { AppError, type AppErrorCode } from "@/server/errors";
import {
  type AdminRole,
  type Decision,
  type DenyReason,
  type Principal,
  type ShopRole,
  decideAdminRole,
  decideCustomer,
  decideShopRole,
  decideStaffAwardLimit,
} from "./policies";
import { currentPrincipal } from "./principal";
import {
  type AdminScope,
  type CustomerScope,
  mintAdminScope,
  mintCustomerScope,
  mintShopScope,
  type ShopScope,
} from "./scope";

export * from "./policies";
export {
  type AdminScope,
  auditActor,
  type CustomerScope,
  type Scope,
  type ShopScope,
  type SystemScope,
  systemScope,
} from "./scope";

/** Deny reason → error code; messages come from the one map in server/errors.ts. */
const CODES: Record<DenyReason, AppErrorCode> = {
  unauthenticated: "UNAUTHENTICATED",
  mfa_required: "MFA_REQUIRED",
  session_expired: "REAUTH_REQUIRED",
  forbidden: "FORBIDDEN",
  over_limit: "LIMIT_REACHED",
};

/** Message overrides where the code's default would be too vague for this decision. */
const OVERRIDES: Partial<Record<DenyReason, string>> = {
  over_limit: "This award is above your limit. Ask the shop owner to approve it.",
};

function unwrap<T>(d: Decision<T>): T {
  if (d.ok) return d.value;
  throw new AppError(CODES[d.reason], OVERRIDES[d.reason]);
}

/**
 * Every server action / route handler calls one of these before touching data. Each returns a branded scope,
 * the only thing repositories accept (src/server/repos/_base.ts).
 */
export async function requireCustomer(principal?: Principal | null): Promise<CustomerScope> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return mintCustomerScope(unwrap(decideCustomer(p)));
}

/**
 * Any signed-in user acting on their own account (e.g. signed-in devices), with the current session's id so
 * "this device" can be told apart. Same allow rule as requireCustomer: the user id always comes from the session.
 */
export async function requireOwnAccount(principal?: Principal | null): Promise<{
  scope: CustomerScope;
  sessionId: string | null;
}> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return { scope: mintCustomerScope(unwrap(decideCustomer(p))), sessionId: p?.sessionId ?? null };
}

export async function requireShopRole(
  shopId: string,
  roles: ReadonlyArray<ShopRole>,
  principal?: Principal | null,
): Promise<ShopScope> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return mintShopScope(unwrap(decideShopRole(p, shopId, roles)));
}

/** Awarding points: a shop role, and for staff an award within their per-award limit (else LIMIT_REACHED). */
export async function requireStaffAwardLimit(
  shopId: string,
  points: number,
  principal?: Principal | null,
): Promise<ShopScope> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return mintShopScope(unwrap(decideStaffAwardLimit(p, shopId, points)));
}

export async function requireAdminRole(
  roles: ReadonlyArray<AdminRole>,
  principal?: Principal | null,
): Promise<AdminScope> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return mintAdminScope(unwrap(decideAdminRole(p, roles)));
}
