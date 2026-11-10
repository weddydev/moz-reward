import "server-only";
import type { Scope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { insertOutbox } from "@/server/repos/outbox";
import { sealEnvelope } from "./envelope";
import { type JobName, type JobPayload, type JobRunAs, jobDef, type QueueName } from "./registry";

/**
 * Outbox writer (P0-18, ENGINEERING §4 step 7). The only way request code produces a job: the row is written
 * in the caller's transaction, so the side effect exists exactly when the change does. The relay (relay.ts)
 * enqueues it after commit with `jobId = outbox.id`.
 */

/** Payloads are ids and enums, never blobs (store a reference to the file or row instead). */
export const OUTBOX_MAX_PAYLOAD_BYTES = 8 * 1024;

export class OutboxPayloadTooLargeError extends Error {
  constructor(queue: string, name: string, bytes: number) {
    super(
      `Outbox payload for ${queue}:${name} is ${String(bytes)} bytes (max ${String(OUTBOX_MAX_PAYLOAD_BYTES)}): store a reference, not the data`,
    );
    this.name = "OutboxPayloadTooLargeError";
  }
}

/**
 * C-30: a tenant scope may only produce tenant jobs (they run under its scope), and only the identity layer or
 * the system may produce system jobs (they run with BYPASSRLS). Otherwise a request could hand the worker a
 * payload naming another shop's rows and have it acted on without RLS.
 */
export function assertProducer(runAs: JobRunAs, scope: Scope, job: string): void {
  const tenant = scope.kind === "customer" || scope.kind === "shop" || scope.kind === "admin";
  const system = scope.kind === "auth" || scope.kind === "system";
  if (runAs === "tenant" ? !tenant : !system) {
    throw new Error(
      `${job} runs as ${runAs}; a ${scope.kind} scope may not write it to the outbox`,
    );
  }
}

export async function writeOutbox<Q extends QueueName, N extends JobName<Q>>(
  scope: Scope,
  tx: Transaction,
  queue: Q,
  name: N,
  payload: JobPayload<Q, N>,
): Promise<string> {
  const def = jobDef(queue, name);
  if (!def) throw new Error(`Unknown job ${queue}:${name}`);
  assertProducer(def.runAs, scope, `${queue}:${name}`);
  const envelope = sealEnvelope(def, payload);
  const bytes = Buffer.byteLength(JSON.stringify(envelope), "utf8");
  if (bytes > OUTBOX_MAX_PAYLOAD_BYTES) throw new OutboxPayloadTooLargeError(queue, name, bytes);
  return insertOutbox(scope, tx, { queue, jobName: name, payload: envelope });
}
