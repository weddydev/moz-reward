import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { runIntegrityCheckAction } from "@/features/admin/integrity/actions";
import { runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { outbox } from "@/server/db/schema";
import { authzMatrix, world } from "./harness";

// P1-17: an on-demand data-integrity run is the admin owner's (with TOTP) alone; the run itself is the worker's.
authzMatrix("runIntegrityCheckAction", {
  allow: ["admin_owner"],
  run: () => runIntegrityCheckAction({}),
});

it("[P1-17] the admin trigger queues the nightly job through the outbox and takes no input", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.admin_owner, () => runIntegrityCheckAction({}));
  expect(res).toMatchObject({ ok: true, data: { queued: true } });
  const rows = await db()
    .select()
    .from(outbox)
    .where(and(eq(outbox.queue, "scheduled"), eq(outbox.jobName, "integrity-check-requested")));
  expect(rows.length).toBeGreaterThanOrEqual(1);
  const bad = await runAsPrincipal(w.principals.admin_owner, () =>
    runIntegrityCheckAction({ shopId: w.shopA.id }),
  );
  expect(bad).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
});
