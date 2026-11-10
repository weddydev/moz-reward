import "server-only";
import { sealEnvelope } from "./envelope";
import { getQueue } from "./queues";
import { DEFAULT_JOB_OPTIONS, jobDef } from "./registry";
import type { JobName, JobPayload, QueueName } from "./registry";

/**
 * Repeatable schedules (P0-04, ARCHITECTURE §6). Definitions live in code; every cron runs in Europe/London so
 * "06:00" means 06:00 UK time across the BST change. Registration is idempotent (upsert by id), so restarts
 * never double-register; only schedules listed in RETIRED_SCHEDULES are removed.
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

/**
 * Schedule ids taken out of code. Only these are removed at start-up (CR-L2): during a rolling deploy or a
 * rollback an older worker starts next to newer code, and "remove whatever isn't in my list" would delete
 * the newer schedules. Add an id here when removing its definition; drop it a release later.
 */
export const RETIRED_SCHEDULES: readonly string[] = [];

export async function registerSchedules(
  defs: readonly ScheduleDef[] = SCHEDULES,
  retired: readonly string[] = RETIRED_SCHEDULES,
): Promise<{ upserted: string[]; removed: string[]; unknown: string[] }> {
  const ids = new Set(defs.map((d) => d.id));
  if (ids.size !== defs.length) throw new Error("Duplicate schedule id");
  const clash = retired.filter((id) => ids.has(id));
  if (clash.length > 0) throw new Error(`Schedule both defined and retired: ${clash.join(", ")}`);
  const upserted: string[] = [];
  for (const def of defs) {
    await getQueue(def.queue).upsertJobScheduler(
      def.id,
      { pattern: def.pattern, tz: SCHEDULE_TZ },
      { name: def.name, data: sealed(def), opts: DEFAULT_JOB_OPTIONS },
    );
    upserted.push(def.id);
  }
  const retiredIds = new Set(retired);
  const removed: string[] = [];
  const unknown: string[] = [];
  for (const queue of new Set<QueueName>(["scheduled", ...defs.map((d) => d.queue)])) {
    for (const existing of await getQueue(queue).getJobSchedulers()) {
      const key = existing.key;
      if (!key || ids.has(key)) continue;
      if (retiredIds.has(key)) {
        await getQueue(queue).removeJobScheduler(key);
        removed.push(key);
      } else {
        // Probably defined by a newer release running alongside this one: leave it alone.
        unknown.push(key);
      }
    }
  }
  return { upserted, removed, unknown };
}
