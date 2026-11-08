import "server-only";
import { Queue } from "bullmq";
import { isInsideTransaction } from "@/server/repos/_base";
import { bullPrefix, createRedis } from "./connection";
import {
  DEFAULT_JOB_OPTIONS,
  type JobName,
  type JobPayload,
  payloadSchema,
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
 * Typed enqueue (P0-04). Validates the payload against the registry schema and refuses to run inside a
 * repository transaction: call it after the transaction resolves. Pass `jobId` to make the enqueue
 * idempotent (BullMQ ignores a second job with the same id). Returns the job id.
 */
export async function enqueue<Q extends QueueName, N extends JobName<Q>>(
  queue: Q,
  name: N,
  payload: JobPayload<Q, N>,
  opts: { jobId?: string; delay?: number } = {},
): Promise<string> {
  if (isInsideTransaction()) throw new EnqueueInTransactionError();
  const schema = payloadSchema(queue, name);
  if (!schema) throw new Error(`Unknown job ${queue}:${name}`);
  const data: unknown = schema.parse(payload);
  const job = await getQueue(queue).add(name, data, opts);
  if (!job.id) throw new Error(`BullMQ returned no id for ${queue}:${name}`);
  return job.id;
}
