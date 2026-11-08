import "server-only";
import type { AdminRole, ShopRole } from "./policies";

/**
 * Proof of authorisation (P0-03, SECURITY §3). Repositories only accept a scope, and a scope can only be made
 * by `requireCustomer` / `requireShopRole` / `requireAdminRole` (they call the mint functions below) or by an
 * explicit, greppable `systemScope("why")` for jobs and global configuration. The brand is type-level only:
 * a plain `{ userId }` object does not type-check where a scope is expected. ESLint keeps the mint functions
 * inside src/server/authz (and test support) and bans `as …Scope` casts everywhere else.
 */
declare const scopeBrand: unique symbol;
type Branded<T, K extends string> = Readonly<T> & { readonly [scopeBrand]: K };

export type CustomerScope = Branded<{ kind: "customer"; userId: string }, "customer">;
export type ShopScope = Branded<
  { kind: "shop"; userId: string; shopId: string; role: ShopRole },
  "shop"
>;
export type AdminScope = Branded<{ kind: "admin"; userId: string; role: AdminRole }, "admin">;
export type SystemScope = Branded<{ kind: "system"; reason: string }, "system">;
export type Scope = CustomerScope | ShopScope | AdminScope | SystemScope;

export const mintCustomerScope = (v: { userId: string }): CustomerScope =>
  Object.freeze({ kind: "customer", userId: v.userId }) as CustomerScope;

export const mintShopScope = (v: { userId: string; shopId: string; role: ShopRole }): ShopScope =>
  Object.freeze({ kind: "shop", userId: v.userId, shopId: v.shopId, role: v.role }) as ShopScope;

export const mintAdminScope = (v: { userId: string; role: AdminRole }): AdminScope =>
  Object.freeze({ kind: "admin", userId: v.userId, role: v.role }) as AdminScope;

/**
 * For work no user asked for (jobs, schedules, global config reads). The reason is mandatory so every system
 * access is explained where it happens and easy to audit with `grep systemScope(`.
 */
export function systemScope(reason: string): SystemScope {
  if (reason.trim().length < 8) throw new Error("systemScope needs a real reason");
  return Object.freeze({ kind: "system", reason }) as SystemScope;
}

/** Audit actor fields for a scope (actor_role is free text in audit_logs). */
export function auditActor(scope: Scope): { actorId: string | null; actorRole: string } {
  switch (scope.kind) {
    case "customer":
      return { actorId: scope.userId, actorRole: "customer" };
    case "shop":
      return { actorId: scope.userId, actorRole: `shop:${scope.role}` };
    case "admin":
      return { actorId: scope.userId, actorRole: `admin:${scope.role}` };
    case "system":
      return { actorId: null, actorRole: "system" };
  }
}
