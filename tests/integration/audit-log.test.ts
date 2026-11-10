import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintShopScope, systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { audit } from "@/server/services/audit";
import { makeShop, makeUser } from "../fixtures/factories";

describe("[P0-03] audit_logs (append-only)", () => {
  it("accepts inserts but rejects UPDATE and DELETE", async () => {
    const rowId = newId();
    await db()
      .insert(auditLogs)
      .values({ id: rowId, actorRole: "system", action: "test.append_only", entity: "test" });

    // Drizzle wraps driver errors; the Postgres message is on `cause`.
    const appendOnly = {
      cause: expect.objectContaining({
        message: expect.stringMatching(/append-only/) as unknown,
      }) as unknown,
    };
    await expect(
      db().update(auditLogs).set({ action: "tampered" }).where(eq(auditLogs.id, rowId)),
    ).rejects.toMatchObject(appendOnly);
    await expect(db().delete(auditLogs).where(eq(auditLogs.id, rowId))).rejects.toMatchObject(
      appendOnly,
    );

    const [row] = await db().select().from(auditLogs).where(eq(auditLogs.id, rowId));
    expect(row?.action).toBe("test.append_only");
  });

  it("stores shop locations as SRID 4326 geography points", async () => {
    const result = await db().execute<{ type: string }>(
      sql`SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'shops'::regclass AND attname = 'location'`,
    );
    expect(result[0]?.type).toBe("geography(Point,4326)");
  });
});

describe("[P0-05] audit() writer", () => {
  it("records actor from the scope, scrubs personal data from meta and stores only a keyed IP hash", async () => {
    const user = await makeUser();
    const shop = await makeShop();
    const id = newId();
    await audit(db(), {
      actor: mintShopScope({ userId: user.id, shopId: shop.id, role: "owner" }),
      action: "test.points_approved",
      entity: "point_request",
      entityId: id,
      meta: {
        amountPence: 450,
        customerEmail: "jo@example.co.uk",
        note: "customer asked to call 07700 900123",
        token: "tok_live_123",
        nested: { phone: "07700900123", status: "approved" },
      },
      ip: "203.0.113.7",
    });
    const [row] = await db().select().from(auditLogs).where(eq(auditLogs.entityId, id));
    expect(row).toMatchObject({
      actorId: user.id,
      actorRole: "shop:owner",
      action: "test.points_approved",
      entity: "point_request",
      meta: {
        amountPence: 450,
        customerEmail: "[redacted]",
        note: "customer asked to call [redacted]",
        token: "[redacted]",
        nested: { phone: "[redacted]", status: "approved" },
      },
    });
    expect(row?.ipHash).toBeTruthy();
    expect(row?.ipHash).not.toContain("203.0.113.7");
    expect(JSON.stringify(row)).not.toMatch(/jo@example|07700|tok_live/);
  });

  it("system actor has no user id; meta defaults to {} and ip to null", async () => {
    const id = newId();
    await audit(db(), {
      actor: systemScope("test: audit"),
      action: "test.system",
      entity: "test",
      entityId: id,
    });
    const [row] = await db().select().from(auditLogs).where(eq(auditLogs.entityId, id));
    expect(row).toMatchObject({ actorId: null, actorRole: "system", meta: {}, ipHash: null });
  });
});
