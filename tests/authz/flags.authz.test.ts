import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { setFeatureFlag } from "@/features/flags/actions";
import { db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { authzMatrix, world } from "./harness";
import { runAsPrincipal } from "@/server/authz/principal";

authzMatrix("setFeatureFlag", {
  allow: ["admin_owner"],
  run: () => setFeatureFlag({ key: "ai_review_help", enabled: false }),
});

it("[P0-07] setFeatureFlag writes an audit entry", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.admin_owner, () =>
    setFeatureFlag({ key: "game_rewards", enabled: true }),
  );
  expect(res).toEqual({ ok: true, data: { key: "game_rewards", enabled: true } });
  const rows = await db().select().from(auditLogs).where(eq(auditLogs.entityId, "game_rewards"));
  expect(
    rows.some(
      (r) => r.action === "feature_flag.set" && r.actorId === w.principals.admin_owner?.userId,
    ),
  ).toBe(true);
});

it("[P0-07] setFeatureFlag rejects unknown flags", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.admin_owner, () =>
    setFeatureFlag({ key: "free_money", enabled: true }),
  );
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.code).toBe("VALIDATION");
});
