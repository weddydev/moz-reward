import "server-only";
import { sealEnvelope } from "./envelope";
import { getQueue } from "./queues";
import { DEFAULT_JOB_OPTIONS, jobDef } from "./registry";
import type { JobName, JobPayload, QueueName } from "./registry";

/**
 * Repeatable schedules (P0-04, ARCHITECTURE §6). Definitions live in code; every cron runs in Europe/London so
 * "06:00" means 06:00 UK time across the BST change. Registration is idempotent: upsert by id, and schedules
 * no longer in code are removed, so restarts never double-register.
 */
export const SCHEDULE_TZ = "Europe/London";

export type ScheduleDef = {
  id: string;
  queue: QueueName;
  name: string;
  pattern: string;
  data: unknown;
};

export function defineSchedule<Q extends QueueName, N extends JobName<Q>>(def: {
  id: string;
  queue: Q;
  name: N;
  pattern: string;
  data: JobPayload<Q, N>;
}): ScheduleDef {
  return def;
}

export const SCHEDULES: readonly ScheduleDef[] = [
  defineSchedule({
    id: "heartbeat",
    queue: "scheduled",
    name: "heartbeat",
    pattern: "* * * * *",
    data: {},
  }),
  defineSchedule({
    id: "outbox-sweep",
    queue: "scheduled",
    name: "outbox-sweep",
    pattern: "* * * * *",
    data: {},
  }),
];

/** The schedule's data in the versioned envelope (re-sealed on every start, so a version bump applies). */
function sealed(def: ScheduleDef): unknown {
  const job = jobDef(def.queue, def.name);
  if (!job) throw new Error(`Schedule ${def.id}: unknown job ${def.queue}:${def.name}`);
  return sealEnvelope(job, def.data);
}

export async function registerSchedules(
  defs: readonly ScheduleDef[] = SCHEDULES,
): Promise<{ upserted: string[]; removed: string[] }> {
  const ids = new Set(defs.map((d) => d.id));
  if (ids.size !== defs.length) throw new Error("Duplicate schedule id");
  const upserted: string[] = [];
  for (const def of defs) {
    await getQueue(def.queue).upsertJobScheduler(
      def.id,
      { pattern: def.pattern, tz: SCHEDULE_TZ },
      { name: def.name, data: sealed(def), opts: DEFAULT_JOB_OPTIONS },
    );
    upserted.push(def.id);
  }
  const removed: string[] = [];
  for (const queue of new Set<QueueName>(["scheduled", ...defs.map((d) => d.queue)])) {
    for (const existing of await getQueue(queue).getJobSchedulers()) {
      if (existing.key && !ids.has(existing.key)) {
        await getQueue(queue).removeJobScheduler(existing.key);
        removed.push(existing.key);
      }
    }
  }
  return { upserted, removed };
}
