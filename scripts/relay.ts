/**
 * `pnpm relay --replay-since <ISO time with zone> [--dry-run] [--force]` (P0-18, RUNBOOK restore;
 * ARCHITECTURE §6, §9). `--dry-run` counts without dispatching; more than 24 h back needs `--force`.
 * After restoring the database onto a host whose redis-queue is empty, re-dispatches every outbox row that was
 * dispatched at or after the given time and is not recorded as complete. Pass the restore point minus N
 * minutes (the RUNBOOK says how many). Safe to run more than once: jobs keep `jobId = outbox.id`, and the
 * worker skips rows already complete. The relay itself runs inside `pnpm worker`; this is replay only.
 */
import "./load-env";
import { parseArgs } from "node:util";
import { bootOrExit, runBootChecks } from "@/server/boot";
import { setDbProcess } from "@/server/db/client";
import { closeQueues } from "@/server/jobs/queues";
import { parseReplaySince, replayOutbox } from "@/server/jobs/relay";

/** Replays further back than this need --force (a restore point is minutes or hours ago, not days). */
const MAX_REPLAY_HOURS = 24;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "replay-since": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
    strict: true,
  });
  const parsed = parseReplaySince(values["replay-since"]);
  if (!parsed.ok) {
    console.error(`relay: ${parsed.error}`);
    return 2;
  }
  const ageHours = (Date.now() - parsed.since.getTime()) / 3_600_000;
  if (ageHours > MAX_REPLAY_HOURS && !values.force) {
    console.error(
      `relay: ${parsed.since.toISOString()} is ${ageHours.toFixed(1)} h ago (over ${String(MAX_REPLAY_HOURS)} h); a typo here re-sends days of side effects. Re-run with --force if you mean it.`,
    );
    return 2;
  }
  setDbProcess("worker");
  await bootOrExit(runBootChecks);
  try {
    if (values["dry-run"]) {
      const counted = await replayOutbox(parsed.since, { dryRun: true });
      console.warn(`relay: dry run, would re-dispatch ${String(counted.replayed)} outbox row(s)`);
      return 0;
    }
    const { replayed } = await replayOutbox(parsed.since);
    console.warn(
      `relay: re-dispatched ${String(replayed)} outbox row(s) since ${parsed.since.toISOString()}`,
    );
    return 0;
  } finally {
    await closeQueues();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error("relay: replay failed (safe to run again):", err);
    process.exit(1);
  },
);
