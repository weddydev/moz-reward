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

export * from "./policies";

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

/** Every server action / route handler calls one of these before touching data. */
export async function requireCustomer(principal?: Principal | null): Promise<{ userId: string }> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return unwrap(decideCustomer(p));
}

export async function requireShopRole(
  shopId: string,
  roles: ReadonlyArray<ShopRole>,
  principal?: Principal | null,
): Promise<{ userId: string; shopId: string; role: ShopRole }> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return unwrap(decideShopRole(p, shopId, roles));
}

export async function requireAdminRole(
  roles: ReadonlyArray<AdminRole>,
  principal?: Principal | null,
): Promise<{ userId: string; role: AdminRole }> {
  const p = principal === undefined ? await currentPrincipal() : principal;
  return unwrap(decideAdminRole(p, roles));
}
