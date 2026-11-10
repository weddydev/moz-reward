import "server-only";
import { Queue } from "bullmq";
import { isInsideTransaction } from "@/server/repos/_base";
import { bullPrefix, createRedis } from "./connection";
import { sealEnvelope } from "./envelope";
import {
  DEFAULT_JOB_OPTIONS,
  type JobName,
  type JobPayload,
  jobDef,
  type QueueName,
} from "./registry";
import type { Redis } from "ioredis";

type QueueState = { connection?: Redis | undefined; queues: Map<string, Queue> };
const state = ((globalThis as { __mozQueues?: QueueState }).__mozQueues ??= { queues: new Map() });

/** Producer-side queue (shared connection, one instance per name per process). */
export function getQueue(name: QueueName | (string & {})): Queue {
  let queue = state.queues.get(name);
  if (!queue) {
    state.connection ??= createRedis("producer");
    queue = new Queue(name, {
      connection: state.connection,
      prefix: bullPrefix(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    state.queues.set(name, queue);
  }
  return queue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...state.queues.values()].map((q) => q.close()));
  state.queues.clear();
  await state.connection?.quit();
  state.connection = undefined;
}

export class EnqueueInTransactionError extends Error {
  constructor() {
    super(
      "enqueue() called inside a transaction: enqueue after the commit, or the job may outlive a rollback",
    );
    this.name = "EnqueueInTransactionError";
  }
}

/**
 * Typed enqueue (P0-04). Validates the payload against the registry schema, wraps it in the versioned envelope
 * (envelope.ts) and refuses to run inside a repository transaction. Request code never calls this: side
 * effects go through the outbox (`writeOutbox`), which survives a crash between commit and enqueue. It stays
 * for scripts and tests. Pass `jobId` to make the enqueue idempotent. Returns the job id.
 */
export async function enqueue<Q extends QueueName, N extends JobName<Q>>(
  queue: Q,
  name: N,
  payload: JobPayload<Q, N>,
  opts: { jobId?: string; delay?: number } = {},
): Promise<string> {
  if (isInsideTransaction()) throw new EnqueueInTransactionError();
  const def = jobDef(queue, name);
  if (!def) throw new Error(`Unknown job ${queue}:${name}`);
  const job = await getQueue(queue).add(name, sealEnvelope(def, payload), opts);
  if (!job.id) throw new Error(`BullMQ returned no id for ${queue}:${name}`);
  return job.id;
}

/**
 * The relay's enqueue (relay.ts only): the data was validated and sealed when the outbox row was written, and
 * `jobId = outbox.id` makes a second dispatch of the same row a no-op in BullMQ. Runs outside any transaction.
 */
export async function dispatchJob(
  queue: string,
  name: string,
  data: unknown,
  jobId: string,
): Promise<void> {
  await getQueue(queue).add(name, data, { jobId });
}
