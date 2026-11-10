import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type {
  AdminScope,
  AuthScope,
  CustomerScope,
  Scope,
  ShopScope,
  SystemScope,
} from "@/server/authz/scope";
import { type Database, dbAs, type DbRole, type Transaction } from "@/server/db/client";
// Cycle is safe: services/audit uses withScope only inside a function body.
import { audit } from "@/server/services/audit";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Repository base (P0-03, P0-20, SECURITY §3). Repositories are the only modules that may import the DB client
 * (ESLint `no-restricted-imports`), and they reach it only through these helpers, which all take a scope.
 * Two walls:
 *  1. App filter: tenant conditions are built from the scope (`inShop`, `ownedBy`), never from caller ids.
 *  2. Row-Level Security: every tenant/public query runs in a transaction that first does
 *     `SET LOCAL app.scope / app.user_id / app.shop_id` (set_config(..., true)), as `moz_app` (no BYPASSRLS).
 *     SET LOCAL ends with the transaction, so a pooled connection never carries another request's tenant, and a
 *     transaction-mode pooler can be added with no code change.
 * The scope picks the database role: tenant/public → `moz_app`, auth → `moz_auth`, system → `moz_worker`.
 * The raw pool of the RLS role is never handed out, so there is no `.transaction()` that skips the settings.
 */
export type Executor = Database | Transaction;

const roleFor = (scope: Scope): DbRole =>
  scope.kind === "auth" ? "auth" : scope.kind === "system" ? "system" : "app";

/** Whether queries for this scope depend on the RLS settings (moz_app). */
const needsSettings = (scope: Scope): boolean => roleFor(scope) === "app";

/** The values `SET LOCAL` gives the policies for a scope (drizzle/0009_rls.sql). */
export function rlsSettings(scope: Scope): { scope: string; userId: string; shopId: string } {
  switch (scope.kind) {
    case "customer":
    case "admin":
      return { scope: scope.kind, userId: scope.userId, shopId: "" };
    case "shop":
      return { scope: "shop", userId: scope.userId, shopId: scope.shopId };
    case "public":
    case "auth":
    case "system":
      return { scope: scope.kind, userId: "", shopId: "" };
  }
}

async function applySettings(tx: Transaction, scope: Scope): Promise<void> {
  const s = rlsSettings(scope);
  await tx.execute(
    sql`SELECT set_config('app.scope', ${s.scope}, true), set_config('app.user_id', ${s.userId}, true), set_config('app.shop_id', ${s.shopId}, true)`,
  );
}

/** Which scope opened each transaction, so a tx can't be reused under a different tenant. */
const txScopes = new WeakMap<Transaction, Scope>();

function assertSameScope(tx: Transaction, scope: Scope): void {
  const opened = txScopes.get(tx);
  if (!opened) throw new Error("repository called with a transaction not opened by transaction()");
  const a = rlsSettings(opened);
  const b = rlsSettings(scope);
  if (
    roleFor(opened) !== roleFor(scope) ||
    a.scope !== b.scope ||
    a.userId !== b.userId ||
    a.shopId !== b.shopId
  ) {
    throw new Error(
      `transaction opened for ${opened.kind} scope reused for another scope (${scope.kind})`,
    );
  }
}

const insideTransaction = new AsyncLocalStorage<true>();

/** Runs `fn` in one transaction for an authorised caller, with the scope's RLS settings applied first. */
export function transaction<T>(scope: Scope, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return insideTransaction.run(true, () =>
    dbAs(roleFor(scope)).transaction(async (tx) => {
      if (needsSettings(scope)) await applySettings(tx, scope);
      txScopes.set(tx, scope);
      return fn(tx);
    }),
  );
}

/**
 * Runs one repository operation under `scope`: inside the caller's transaction when `tx` is given (it must
 * have been opened by `transaction()` for the same scope), otherwise in its own short transaction with the
 * RLS settings (tenant/public), or directly on the role's pool (auth/system: their policies don't read
 * settings).
 */
export async function withScope<T>(
  scope: Scope,
  fn: (q: Executor) => Promise<T>,
  tx?: Transaction,
): Promise<T> {
  if (tx) {
    assertSameScope(tx, scope);
    return fn(tx);
  }
  const pool = dbAs(roleFor(scope));
  if (!needsSettings(scope)) return fn(pool);
  return pool.transaction(async (own) => {
    // Sequential on purpose: pipelining set_config with the query would save one round trip, but the send
    // order through drizzle is not guaranteed by construction (DECISIONS P0-20, scripts/rls-bench.ts).
    await applySettings(own, scope);
    return fn(own);
  });
}

/**
 * Cross-shop admin read (SECURITY §3): runs `fn` under the admin scope (RLS `app_is_admin()` checks an active
 * admin_members row) and writes one `admin.read` audit row in the same transaction, so a read that returns
 * data is always on record. Admin repositories read other shops' rows only through this.
 */
export function adminRead<T>(
  scope: AdminScope,
  what: { entity: string; entityId?: string; reason: string },
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return transaction(scope, async (tx) => {
    const result = await fn(tx);
    await audit(tx, {
      actor: scope,
      action: "admin.read",
      entity: what.entity,
      entityId: what.entityId ?? null,
      meta: { reason: what.reason },
    });
    return result;
  });
}

/**
 * The pool of a role whose policies read no settings: `moz_auth` (identity tables) or `moz_worker` (BYPASSRLS).
 * Tenant and public scopes never get a raw pool (use `withScope` / `transaction`).
 */
export function poolFor(scope: AuthScope | SystemScope): Database {
  return dbAs(roleFor(scope));
}

/**
 * True while code runs inside `transaction()`. Side effects that must only follow a commit (enqueueing jobs,
 * sending email) check this and refuse, so a rolled-back transaction can never leave a job pointing at rows
 * that do not exist.
 */
export const isInsideTransaction = (): boolean => insideTransaction.getStore() === true;

const withExtra = (base: SQL, extra: ReadonlyArray<SQL | undefined>): SQL =>
  extra.length === 0 ? base : (and(base, ...extra) ?? base);

/** `column = scope.shopId` (plus optional extra conditions) for shop-owned rows. */
export function inShop(column: AnyPgColumn, scope: ShopScope, ...extra: (SQL | undefined)[]): SQL {
  return withExtra(eq(column, scope.shopId), extra);
}

/** `column = scope.userId` (plus optional extra conditions) for rows a customer owns. */
export function ownedBy(
  column: AnyPgColumn,
  scope: CustomerScope,
  ...extra: (SQL | undefined)[]
): SQL {
  return withExtra(eq(column, scope.userId), extra);
}
