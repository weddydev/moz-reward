import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { setFeatureFlag } from "@/features/flags/actions";
import { defineAction } from "@/server/actionTemplate";
import { requireAdminRole } from "@/server/authz";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { auditLogs, featureFlags } from "@/server/db/schema";
import { upsertFlag } from "@/server/repos/flags";
import { makeActor } from "@/server/testing/factories";

/** A fresh admin owner (own rate-limit bucket), MFA-verified like a real TOTP sign-in. */
async function adminOwner() {
  const { user } = await makeActor("admin_owner");
  return loadPrincipal({ userId: user.id, mfaVerified: true, sessionCreatedAt: new Date() });
}

const flagRow = async (key: string) =>
  (await db().select().from(featureFlags).where(eq(featureFlags.key, key)))[0];

describe("[P0-07] sample action setFeatureFlag: every template step against the real DB and Redis", () => {
  it("writes the change and its audit row together, naming the actor", async () => {
    const admin = await adminOwner();
    const res = await runAsPrincipal(admin, () =>
      setFeatureFlag({ key: "google_business_replies", enabled: true }),
    );
    expect(res).toEqual({ ok: true, data: { key: "google_business_replies", enabled: true } });
    expect((await flagRow("google_business_replies"))?.enabled).toBe(true);
    const audit = await db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.actorId, admin.userId), eq(auditLogs.action, "feature_flag.set")));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorRole: "admin:owner",
      entityId: "google_business_replies",
    });
  });

  it("rate limits per user: the 31st change in a minute is refused before any write", async () => {
    const admin = await adminOwner();
    for (let i = 0; i < 30; i++) {
      const ok = await runAsPrincipal(admin, () =>
        setFeatureFlag({ key: "ai_review_help", enabled: i % 2 === 0 }),
      );
      expect(ok.ok, `call ${String(i + 1)}`).toBe(true);
    }
    const before = await flagRow("ai_review_help");
    const res = await runAsPrincipal(admin, () =>
      setFeatureFlag({ key: "ai_review_help", enabled: !before?.enabled }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect((await flagRow("ai_review_help"))?.enabled).toBe(before?.enabled);

    // Another admin has their own bucket.
    const other = await adminOwner();
    const theirs = await runAsPrincipal(other, () =>
      setFeatureFlag({ key: "ai_review_help", enabled: true }),
    );
    expect(theirs.ok).toBe(true);
  });

  it("a handler that fails after writing rolls back the write and its audit row", async () => {
    const admin = await adminOwner();
    await runAsPrincipal(admin, () => setFeatureFlag({ key: "game_rewards", enabled: false }));
    const breaksAfterWrite = defineAction({
      name: "test.breaksAfterWrite",
      input: z.object({}).strict(),
      authorize: (_i, p) => requireAdminRole(["owner"], p),
      audit: () => ({ action: "test.breaks", entity: "feature_flag", entityId: "game_rewards" }),
      handler: async (_i, scope, { tx }) => {
        await upsertFlag(scope, { key: "game_rewards", enabled: true, description: "x" }, tx);
        throw new Error("boom after the write");
      },
    });

    const res = await runAsPrincipal(admin, () => breaksAfterWrite({}));

    expect(res).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
    });
    expect((await flagRow("game_rewards"))?.enabled).toBe(false);
    const rows = await db().select().from(auditLogs).where(eq(auditLogs.action, "test.breaks"));
    expect(rows).toHaveLength(0);
  });
});
