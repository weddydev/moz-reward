/**
 * `pnpm keys:reencrypt [--dry-run] [--batch-size N]` (P1-04, RUNBOOK §18): after a data-key rotation, re-seals
 * every encrypted field still on an old key id under the current key (`DATA_ENCRYPTION_KEY`; ids are derived
 * from the keys). Prints the rows per key id before and after (the evidence for SESSION_LOG). `--dry-run` only
 * prints the counts and checks.
 * Exit codes: 0 = nothing left on an old key id; 1 = stopped (unregistered column, unknown key id, a value that
 * doesn't open, or rows still on an old key after the last pass); 2 = bad arguments. Safe to run again at any
 * time: an interrupted run rolled back at most one batch. On the host:
 * `sudo docker exec moz-<env>-worker-1 node cli/keys-reencrypt.mjs`.
 */
import "./load-env";
import { parseArgs } from "node:util";
import { bootOrExit, runBootChecks } from "@/server/boot";
import { setDbProcess } from "@/server/db/client";
import {
  keyIdCounts,
  ReencryptError,
  reencryptAll,
  unregisteredEncryptedColumns,
} from "@/server/jobs/reencrypt";
import { fieldKeyring } from "@/server/security/field-keys";

const show = (label: string, counts: Record<string, Record<string, number>>): void => {
  for (const [field, byKey] of Object.entries(counts)) {
    const parts = Object.entries(byKey).map(([k, n]) => `${k}=${String(n)}`);
    console.warn(`keys:reencrypt: ${label} ${field}: ${parts.join(" ") || "(no values)"}`);
  }
};

async function main(): Promise<number> {
  let values: { "dry-run": boolean; "batch-size"?: string | undefined };
  try {
    ({ values } = parseArgs({
      options: { "dry-run": { type: "boolean", default: false }, "batch-size": { type: "string" } },
      strict: true,
    }));
  } catch (err) {
    console.error(`keys:reencrypt: ${(err as Error).message}`);
    return 2;
  }
  const batchSize = values["batch-size"] === undefined ? undefined : Number(values["batch-size"]);
  if (
    batchSize !== undefined &&
    !(Number.isInteger(batchSize) && batchSize >= 1 && batchSize <= 5000)
  ) {
    console.error("keys:reencrypt: --batch-size must be a whole number from 1 to 5000");
    return 2;
  }
  setDbProcess("worker");
  await bootOrExit(runBootChecks);
  const ring = fieldKeyring();
  console.warn(`keys:reencrypt: current key id "${ring.current}"; keyring: ${ring.ids.join(", ")}`);
  show("before", await keyIdCounts());

  if (values["dry-run"]) {
    const problems = await unregisteredEncryptedColumns();
    for (const p of problems) console.error(`keys:reencrypt: ${p}`);
    console.warn(`keys:reencrypt: dry run, nothing changed`);
    return problems.length > 0 ? 1 : 0;
  }

  try {
    const result = await reencryptAll({ ring, ...(batchSize ? { batchSize } : {}) });
    for (const f of result.fields)
      console.warn(
        `keys:reencrypt: ${f.field}: re-sealed ${String(f.rewritten)} row(s) in ${String(f.batches)} batch(es), ${String(f.left)} left on an old key id`,
      );
    show("after", await keyIdCounts());
    if (result.left > 0) {
      console.error(
        `keys:reencrypt: FAIL, ${String(result.left)} row(s) still on an old key id: a web or worker process is still writing with the old keyring (redeploy, then run again)`,
      );
      return 1;
    }
    console.warn(`keys:reencrypt: PASS, every value is on key id "${result.current}"`);
    return 0;
  } catch (err) {
    if (err instanceof ReencryptError) {
      console.error(`keys:reencrypt: STOPPED, ${err.message}`);
      return 1;
    }
    throw err;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error("keys:reencrypt: failed (safe to run again):", err);
    process.exit(1);
  },
);
