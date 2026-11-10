import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testOwnerDb as db } from "@/server/db/client";

describe("[P0-18] web database sessions carry the statement limits (ENGINEERING §6)", () => {
  it("statement_timeout 5 s and idle-in-transaction 15 s on every pooled connection", async () => {
    const rows = await db().execute<{ statement_timeout: string; idle: string }>(
      sql`SELECT current_setting('statement_timeout') AS statement_timeout,
                 current_setting('idle_in_transaction_session_timeout') AS idle`,
    );
    expect([...rows]).toEqual([{ statement_timeout: "5s", idle: "15s" }]);
  });

  it("a query running past the limit is cancelled instead of holding the request", async () => {
    const err = await db()
      .execute(sql`SELECT pg_sleep(6)`)
      .then(
        () => null,
        (e: unknown) => e,
      );
    // Drizzle wraps the driver error ("Failed query: …"); Postgres's reason is the cause.
    expect(String((err as { cause?: unknown } | null)?.cause)).toMatch(/statement timeout/);
  }, 15_000);
});
