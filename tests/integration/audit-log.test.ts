import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

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
