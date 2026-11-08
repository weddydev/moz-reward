import "server-only";
import { AppError } from "@/server/errors";
import {
  type AdminRole,
  type Decision,
  type DenyReason,
  type Principal,
  type ShopRole,
  decideAdminRole,
  decideCustomer,
  decideShopRole,
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

const MESSAGES: Record<DenyReason, [AppError["code"], string]> = {
  unauthenticated: ["UNAUTHENTICATED", "Please sign in to continue."],
  mfa_required: ["MFA_REQUIRED", "Please confirm it's you with your authenticator app."],
  session_expired: ["REAUTH_REQUIRED", "For your security, please sign in again."],
  forbidden: ["FORBIDDEN", "You don't have access to this."],
};

function unwrap<T>(d: Decision<T>): T {
  if (d.ok) return d.value;
  const [code, message] = MESSAGES[d.reason];
  throw new AppError(code, message);
}

/**
 * Every server action / route handler calls one of these before touching data. Each returns a branded scope,
 * the only thing repositories accept (src/server/repos/_base.ts).
 */
export async function requireCustomer(principal?: Principal | null): Promise<CustomerScope> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return mintCustomerScope(unwrap(decideCustomer(p)));
}

export async function requireShopRole(
  shopId: string,
  roles: ReadonlyArray<ShopRole>,
  principal?: Principal | null,
): Promise<ShopScope> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return mintShopScope(unwrap(decideShopRole(p, shopId, roles)));
}

export async function requireAdminRole(
  roles: ReadonlyArray<AdminRole>,
  principal?: Principal | null,
): Promise<AdminScope> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return mintAdminScope(unwrap(decideAdminRole(p, roles)));
}
