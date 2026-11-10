/**
 * `pnpm relay --replay-since <ISO time with zone>` (P0-18, RUNBOOK restore; ARCHITECTURE §6, §9).
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

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { "replay-since": { type: "string" } }, strict: true });
  const parsed = parseReplaySince(values["replay-since"]);
  if (!parsed.ok) {
    console.error(`relay: ${parsed.error}`);
    return 2;
  }
  setDbProcess("worker");
  await bootOrExit(runBootChecks);
  try {
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
