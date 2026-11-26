"use server";

import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireAdminRole } from "@/server/authz";

/**
 * P1-17: an admin owner asks for a data-integrity run now (TESTING §10, "on-demand admin trigger"). The run is
 * the nightly job's reconciliation, queued as `scheduled:integrity-check-requested` (with the admin's scope; the
 * worker re-checks it) through the outbox in this action's transaction with its audit row; a run already in progress makes it skip (single-run lock). The System page
 * button arrives with the P2 admin pages; until then this action is the trigger.
 */
export const runIntegrityCheckAction = defineAction({
  name: "integrity.run",
  input: z.object({}).strict(),
  authorize: (_input, p) => requireAdminRole(["owner"], p),
  // A run reads every membership: a few a minute is plenty; closed, so a Redis outage can't flood the queue.
  rateLimit: { max: 3, windowSec: 60, failMode: "closed" },
  audit: () => ({ action: "integrity.run_requested", entity: "integrity_issues" }),
  handler: async (_input, _scope, { outbox }) => {
    await outbox("scheduled", "integrity-check-requested", {});
    return { queued: true };
  },
});
