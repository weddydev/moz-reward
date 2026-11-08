import "server-only";
import { and, eq, type SQL } from "drizzle-orm";
import type { CustomerScope, Scope, ShopScope } from "@/server/authz/scope";
import { type Database, db, type Transaction } from "@/server/db/client";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Repository base (P0-03, SECURITY §3). Repositories are the only modules that may import the DB client
 * (ESLint `no-restricted-imports`), and they reach it only through these helpers, which all take a scope.
 * A scope comes from requireCustomer / requireShopRole / requireAdminRole, or an explicit systemScope("why").
 * Tenant filters are built from the scope, never from caller-supplied ids, so a shop-scoped query cannot be
 * pointed at another shop.
 */
export type Executor = Database | Transaction;

/** The database for an authorised caller (the scope is the proof; it is not read). Pass `tx` to join a transaction. */
export function dbFor(_scope: Scope, tx?: Transaction): Executor {
  return tx ?? db();
}

/** Runs `fn` in one transaction for an authorised caller. */
export function transaction<T>(_scope: Scope, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db().transaction(fn);
}

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
