/**
 * `pnpm integrity:check [--show N]` (P1-18, RUNBOOK §20): runs the P1-17 data-integrity reconciliation now (the
 * same run as the 04:00 job: read-only on business data, records into `integrity_issues`, alerts on new issues),
 * then prints the open issues per check and the oldest N of each (ids and numbers only). For after a restore
 * (§6 step 3), after a data fix, and to prove "reconciliation clean" on staging at a phase close.
 * Exit codes: 0 = no open issues; 1 = open issues (listed) or the run failed; 2 = bad arguments; 3 = another run
 * holds the lock (try again when it ends; the nightly run takes seconds to minutes). On the host:
 * `sudo docker exec moz-<env>-worker-1 node cli/integrity-check.mjs`.
 */
import "./load-env";
import { parseArgs } from "node:util";
import { systemScope } from "@/server/authz/scope";
import { bootOrExit, runBootChecks } from "@/server/boot";
import { setDbProcess } from "@/server/db/client";
import { errorSummary } from "@/server/jobs/redact";
import { openIssueSummary } from "@/server/repos/integrity";
import { runIntegrityCheck } from "@/server/services/integrity-job";

async function main(): Promise<number> {
  let show = 10;
  try {
    const { values } = parseArgs({ options: { show: { type: "string" } }, strict: true });
    if (values.show !== undefined) show = Number(values.show);
  } catch (err) {
    console.error(`integrity:check: ${(err as Error).message}`);
    return 2;
  }
  if (!(Number.isInteger(show) && show >= 0 && show <= 500)) {
    console.error("integrity:check: --show must be a whole number from 0 to 500");
    return 2;
  }
  setDbProcess("worker");
  await bootOrExit(runBootChecks);
  const scope = systemScope("integrity-check cli");
  const started = Date.now();
  const run = await runIntegrityCheck(scope);
  if (run.skipped) {
    console.error(
      "integrity:check: another run holds the lock; nothing checked (try again shortly)",
    );
    return 3;
  }
  console.warn(
    `integrity:check: checked ${String(run.checkedMemberships)} membership(s) in ${((Date.now() - started) / 1000).toFixed(1)} s: ${String(run.issues)} open issue(s), ${String(run.newIssues)} new, ${String(run.resolved)} resolved`,
  );
  const { counts, oldest } = await openIssueSummary(scope, show);
  for (const [check, n] of Object.entries(counts))
    console.warn(`integrity:check: open ${check}: ${String(n)}`);
  for (const i of oldest)
    console.warn(
      `integrity:check:   ${i.check} ${i.entity}/${i.entityId} shop ${i.shopId ?? "-"} since ${i.detectedAt.toISOString()} ${JSON.stringify(i.details)}`,
    );
  if (run.issues > 0) {
    console.error(
      `integrity:check: FAIL, ${String(run.issues)} open issue(s): triage per RUNBOOK §20`,
    );
    return 1;
  }
  console.warn("integrity:check: PASS, no open issues");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`integrity:check: failed (read-only, safe to run again): ${errorSummary(err)}`);
    process.exit(1);
  },
);
