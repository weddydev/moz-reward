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
/** Rows anyone may see (active shop directory, global configuration). Grants nothing beyond public policies. */
export type PublicScope = Branded<{ kind: "public"; reason: string }, "public">;
/** Identity layer (src/server/auth): sessions, emails and roles looked up before any user scope exists. */
export type AuthScope = Branded<{ kind: "auth"; reason: string }, "auth">;
export type TenantScope = CustomerScope | ShopScope | AdminScope;
export type Scope = TenantScope | PublicScope | AuthScope | SystemScope;

export const mintCustomerScope = (v: { userId: string }): CustomerScope =>
  Object.freeze({ kind: "customer", userId: v.userId }) as CustomerScope;

export const mintShopScope = (v: { userId: string; shopId: string; role: ShopRole }): ShopScope =>
  Object.freeze({ kind: "shop", userId: v.userId, shopId: v.shopId, role: v.role }) as ShopScope;

export const mintAdminScope = (v: { userId: string; role: AdminRole }): AdminScope =>
  Object.freeze({ kind: "admin", userId: v.userId, role: v.role }) as AdminScope;

const realReason = (fn: string, reason: string): string => {
  if (reason.trim().length < 8) throw new Error(`${fn} needs a real reason`);
  return reason;
};

/**
 * Cross-shop work no user asked for (jobs, sweeps, the outbox relay). Runs as the `moz_worker` role
 * (BYPASSRLS), which only the worker and CLI processes can open (P0-20): in the web process a query under it
 * throws. ESLint allows this import only in src/server/jobs, src/worker, scripts and the files listed in
 * eslint.config.mjs (each with its reason). The reason is mandatory and greppable (`grep systemScope(`).
 */
export function systemScope(reason: string): SystemScope {
  return Object.freeze({
    kind: "system",
    reason: realReason("systemScope", reason),
  }) as SystemScope;
}

/** Public reads (shop directory, feature flags): RLS shows only rows every visitor may see. */
export function publicScope(reason: string): PublicScope {
  return Object.freeze({
    kind: "public",
    reason: realReason("publicScope", reason),
  }) as PublicScope;
}

/**
 * The identity layer's scope (moz_auth role: identity tables, read-only roles, append-only audit/outbox).
 * ESLint allows it only in src/server/auth (C-12).
 */
export function authScope(reason: string): AuthScope {
  return Object.freeze({ kind: "auth", reason: realReason("authScope", reason) }) as AuthScope;
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
    case "public":
      return { actorId: null, actorRole: "public" };
    case "auth":
      return { actorId: null, actorRole: "auth" };
  }
}

const SHOP_ROLES: readonly ShopRole[] = ["owner", "staff"];
const ADMIN_ROLES: readonly AdminRole[] = ["owner", "support", "moderator", "finance"];
const isShopRole = (r: string | null): r is ShopRole =>
  r !== null && (SHOP_ROLES as readonly string[]).includes(r);
const isAdminRole = (r: string | null): r is AdminRole =>
  r !== null && (ADMIN_ROLES as readonly string[]).includes(r);

/**
 * The tenant scope an outbox row was written under (P0-20, C-30), for the worker to run that row's tenant job
 * with. Null when the row was not written by a tenant scope or its fields are incomplete: the job is refused.
 * The database re-checks the role on every query (RLS `app_in_shop()` / `app_is_admin()`), so a scope rebuilt
 * for someone who lost the role since gets no rows.
 */
export function tenantScopeFromOutbox(row: {
  scopeKind: string;
  scopeUserId: string | null;
  scopeShopId: string | null;
  scopeRole: string | null;
}): TenantScope | null {
  const userId = row.scopeUserId;
  if (!userId) return null;
  switch (row.scopeKind) {
    case "customer":
      return mintCustomerScope({ userId });
    case "shop":
      return row.scopeShopId && isShopRole(row.scopeRole)
        ? mintShopScope({ userId, shopId: row.scopeShopId, role: row.scopeRole })
        : null;
    case "admin":
      return isAdminRole(row.scopeRole) ? mintAdminScope({ userId, role: row.scopeRole }) : null;
    default:
      return null;
  }
}
