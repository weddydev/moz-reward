import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { memberships, shopStaff } from "@/server/db/schema";
import { inShop, ownedBy } from "@/server/repos/_base";
import {
  auditActor,
  mintAdminScope,
  mintCustomerScope,
  mintShopScope,
  type ShopScope,
  systemScope,
} from "./scope";

const dialect = new PgDialect({ casing: "snake_case" }); // same casing as the real client

describe("[P0-03] scopes", () => {
  it("a plain object is not a scope (type-level brand)", () => {
    // @ts-expect-error -- scopes are branded; only src/server/authz can mint them
    const forged: ShopScope = { kind: "shop", userId: "u", shopId: "s", role: "owner" };
    expect(forged.kind).toBe("shop");
  });

  it("minted scopes are frozen so a handler cannot re-point them at another shop", () => {
    const scope = mintShopScope({ userId: "u1", shopId: "shop-a", role: "staff" });
    expect(Object.isFrozen(scope)).toBe(true);
    expect(() => {
      (scope as unknown as { shopId: string }).shopId = "shop-b";
    }).toThrow(TypeError);
    expect(scope.shopId).toBe("shop-a");
  });

  it("systemScope demands a real reason", () => {
    expect(() => systemScope("")).toThrow(/reason/);
    expect(() => systemScope("   x   ")).toThrow(/reason/);
    expect(systemScope("nightly expiry job").reason).toBe("nightly expiry job");
  });

  it("maps each scope to audit actor fields", () => {
    expect(auditActor(mintCustomerScope({ userId: "c" }))).toEqual({
      actorId: "c",
      actorRole: "customer",
    });
    expect(auditActor(mintShopScope({ userId: "s", shopId: "x", role: "owner" }))).toEqual({
      actorId: "s",
      actorRole: "shop:owner",
    });
    expect(auditActor(mintAdminScope({ userId: "a", role: "finance" }))).toEqual({
      actorId: "a",
      actorRole: "admin:finance",
    });
    expect(auditActor(systemScope("nightly expiry job"))).toEqual({
      actorId: null,
      actorRole: "system",
    });
  });
});

describe("[P0-03] repo tenant filters", () => {
  it("inShop filters by the scope's shop, never a caller-supplied id", () => {
    const scope = mintShopScope({ userId: "u1", shopId: "shop-a", role: "owner" });
    const q = dialect.sqlToQuery(inShop(shopStaff.shopId, scope));
    expect(q.sql).toBe('"shop_staff"."shop_id" = $1');
    expect(q.params).toEqual(["shop-a"]);
  });

  it("ownedBy filters by the customer's own user id and ANDs extra conditions", () => {
    const scope = mintCustomerScope({ userId: "cust-1" });
    const extra = inShop(
      memberships.shopId,
      mintShopScope({ userId: "x", shopId: "shop-z", role: "staff" }),
    );
    const q = dialect.sqlToQuery(ownedBy(memberships.userId, scope, extra));
    expect(q.sql).toContain('"memberships"."user_id" = $1');
    expect(q.sql).toContain(" and ");
    expect(q.params).toEqual(["cust-1", "shop-z"]);
  });
});
