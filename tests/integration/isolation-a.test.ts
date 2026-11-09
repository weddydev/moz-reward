import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { featureFlags, shops } from "@/server/db/schema";
import { makeShop } from "../fixtures/factories";

// Paired with isolation-b.test.ts: both write the same primary key and count the
// same table. They only pass together because each worker has its own database and every file starts empty.
describe("[P0-17] per-worker database isolation (a)", () => {
  it("sees only its own rows in a shared table", async () => {
    await db().insert(featureFlags).values({ key: "isolation_probe", enabled: true });
    for (let i = 0; i < 3; i++) await makeShop({ name: "Isolation a" });
    const [count] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(shops);
    expect(count?.n).toBe(3);
    const [flag] = await db()
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, "isolation_probe"));
    expect(flag?.enabled).toBe(true);
    expect(process.env.DATABASE_URL).toMatch(/_w\d+$/);
    console.warn(
      `[isolation-a] worker DB ${process.env.DATABASE_URL?.split("/").pop()} pid=${process.pid}`,
    );
  });
});
