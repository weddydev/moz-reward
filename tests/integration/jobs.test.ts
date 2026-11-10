import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { systemScope } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import { failedJobs, jobHeartbeats } from "@/server/db/schema";
import { closeQueues, EnqueueInTransactionError, enqueue, getQueue } from "@/server/jobs/queues";
import { REDACTED } from "@/server/jobs/redact";
import { registerSchedules, SCHEDULE_TZ, type ScheduleDef } from "@/server/jobs/scheduler";
import {
  createQueueWorker,
  type Processor,
  type RecordFailure,
  startWorkers,
} from "@/server/jobs/worker";
import { transaction } from "@/server/repos/_base";
import { recordFailedJob } from "@/server/repos/jobs";
import type { Job } from "bullmq";

const open: { close: () => Promise<void> }[] = [];

function worker(queue: string, processor: Processor, concurrency = 1): void {
  const { worker: w, connection } = createQueueWorker(queue, processor, { concurrency });
  open.push({
    close: async () => {
      await w.close();
      await connection.quit();
    },
  });
}

async function waitFor<T>(
  probe: () => Promise<T | undefined | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > deadline) throw new Error("waitFor: timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

const stateOf = async (queue: string, id: string): Promise<string | undefined> =>
  (await getQueue(queue).getJob(id))?.getState();

const fast = { attempts: 3, backoff: { type: "exponential", delay: 100 } } as const;

afterEach(async () => {
  await Promise.all(open.splice(0).map((o) => o.close()));
});

afterAll(async () => {
  await closeQueues();
});

describe("[P0-04] enqueue", () => {
  it("processes a registry job end to end (scheduled:heartbeat writes its last-run time)", async () => {
    await getQueue("scheduled").obliterate({ force: true });
    const id = await enqueue("scheduled", "heartbeat", {});
    const running = startWorkers(["scheduled"]);
    open.push(running);
    await waitFor(async () => (await stateOf("scheduled", id)) === "completed");
    const [row] = await db()
      .select()
      .from(jobHeartbeats)
      .where(eq(jobHeartbeats.name, "scheduled:heartbeat"));
    expect(Date.now() - (row?.lastRunAt.getTime() ?? 0)).toBeLessThan(30_000);
  });

  it("refuses to enqueue inside a transaction (jobs only after commit)", async () => {
    await expect(
      transaction(systemScope("test: enqueue inside a transaction"), () =>
        enqueue("scheduled", "heartbeat", {}),
      ),
    ).rejects.toBeInstanceOf(EnqueueInTransactionError);
  });

  it("validates the payload against the registry schema", async () => {
    await expect(
      enqueue("scheduled", "heartbeat", { unexpected: true } as unknown as Record<string, never>),
    ).rejects.toThrow();
  });

  it("is idempotent with a jobId", async () => {
    const queue = `t-${newId()}`;
    const a = await getQueue(queue).add("x", {}, { jobId: "same" });
    const b = await getQueue(queue).add("x", {}, { jobId: "same" });
    expect(a.id).toBe(b.id);
    expect(await getQueue(queue).getJobCountByTypes("waiting")).toBe(1);
  });
});

describe("[P0-04] durability and shutdown", () => {
  it("jobs enqueued while no worker runs are processed after a (re)start", async () => {
    const queue = `t-${newId()}`;
    const seen: string[] = [];
    worker(queue, async (job) => {
      seen.push(String((job.data as { n: number }).n));
    });
    await Promise.all(open.splice(0).map((o) => o.close())); // worker stopped
    const ids = await Promise.all(
      [1, 2, 3].map(async (n) => (await getQueue(queue).add("n", { n })).id ?? ""),
    );
    expect(await getQueue(queue).getJobCountByTypes("waiting")).toBe(3);
    worker(queue, async (job) => {
      seen.push(String((job.data as { n: number }).n));
    });
    await waitFor(async () => {
      const states = await Promise.all(ids.map((id) => stateOf(queue, id)));
      return states.every((s) => s === "completed");
    });
    expect(seen.sort()).toEqual(["1", "2", "3"]);
  });

  it("close() waits for in-flight jobs instead of dropping them", async () => {
    const queue = `t-${newId()}`;
    let finished = false;
    worker(queue, async () => {
      await new Promise((r) => setTimeout(r, 800));
      finished = true;
    });
    const job = await getQueue(queue).add("slow", {});
    await waitFor(async () => (await stateOf(queue, job.id ?? "")) === "active");
    await Promise.all(open.splice(0).map((o) => o.close()));
    expect(finished).toBe(true);
    expect(await stateOf(queue, job.id ?? "")).toBe("completed");
  });
});

describe("[P0-04] crash recovery", () => {
  it("a job held by a crashed worker is picked up again by the next worker (stalled-job recovery)", async () => {
    const queue = `t-${newId()}`;
    const timings = { concurrency: 1, lockDuration: 1_000, stalledInterval: 500 };
    const crashed = createQueueWorker(queue, () => new Promise(() => {}), timings); // hangs forever
    const job = await getQueue(queue).add("survivor", {}, { attempts: 3 });
    await waitFor(async () => (await stateOf(queue, job.id ?? "")) === "active");
    await crashed.worker.close(true); // force: no waiting, lock not released, like a killed process
    await crashed.connection.quit();
    let ranAgain = false;
    const next = createQueueWorker(
      queue,
      async () => {
        ranAgain = true;
      },
      timings,
    );
    open.push({
      close: async () => {
        await next.worker.close();
        await next.connection.quit();
      },
    });
    await waitFor(async () => (await stateOf(queue, job.id ?? "")) === "completed", 15_000);
    expect(ranAgain).toBe(true);
  });
});

describe("[P0-04] retries and dead letters", () => {
  it("retries with exponential backoff and succeeds without a dead letter", async () => {
    const queue = `t-${newId()}`;
    const attemptsAt: number[] = [];
    worker(queue, async () => {
      attemptsAt.push(Date.now());
      if (attemptsAt.length < 3) throw new Error("transient");
    });
    const job = await getQueue(queue).add("flaky", {}, fast);
    await waitFor(async () => (await stateOf(queue, job.id ?? "")) === "completed");
    expect(attemptsAt).toHaveLength(3);
    const [a, b, c] = attemptsAt as [number, number, number];
    expect(b - a).toBeGreaterThanOrEqual(90); // 100 ms
    expect(c - b).toBeGreaterThanOrEqual(190); // 200 ms (exponential)
    expect(await db().select().from(failedJobs).where(eq(failedJobs.queue, queue))).toEqual([]);
  });

  it("a job failing 3 times lands in failed_jobs with a redacted payload", async () => {
    const queue = `t-${newId()}`;
    let attempts = 0;
    worker(queue, async (job: Job) => {
      attempts++;
      throw new Error(`cannot email ${(job.data as { email: string }).email}`);
    });
    const job = await getQueue(queue).add(
      "doomed",
      { userId: "u-1", email: "jo@example.co.uk" },
      fast,
    );
    const [row] = await waitFor(async () => {
      const rows = await db().select().from(failedJobs).where(eq(failedJobs.queue, queue));
      return rows.length > 0 ? rows : undefined;
    });
    expect(attempts).toBe(3);
    expect(row).toMatchObject({
      jobName: "doomed",
      jobId: job.id,
      attempts: 3,
      payload: { userId: "u-1", email: REDACTED },
      resolvedAt: null,
    });
    expect(row?.error).toContain("cannot email");
    expect(row?.error).not.toContain("jo@example.co.uk");
    await waitFor(async () => (await stateOf(queue, job.id ?? "")) === "failed");
  });

  it("a job that stalls past the limit (worker crashed twice) is dead-lettered although no processor finished", async () => {
    const queue = `t-${newId()}`;
    const timings = { concurrency: 1, lockDuration: 500, stalledInterval: 250 };
    const job = await getQueue(queue).add("crashy", { userId: "u-1" }, { attempts: 3 });
    const crashWhileHolding = async (): Promise<void> => {
      let started = false;
      const doomed = createQueueWorker(
        queue,
        () => {
          started = true;
          return new Promise(() => {}); // hangs: the process "dies" holding the job
        },
        timings,
      );
      await waitFor(async () => started);
      await doomed.worker.close(true); // force: lock not released, like a killed process
      await doomed.connection.quit();
    };
    await crashWhileHolding();
    await crashWhileHolding(); // second stall exceeds maxStalledCount (1)
    let ranAgain = false;
    const next = createQueueWorker(
      queue,
      async () => {
        ranAgain = true;
      },
      timings,
    );
    open.push({
      close: async () => {
        await next.worker.close();
        await next.connection.quit();
      },
    });
    const [row] = await waitFor(async () => {
      const rows = await db().select().from(failedJobs).where(eq(failedJobs.queue, queue));
      return rows.length > 0 ? rows : undefined;
    });
    expect(ranAgain).toBe(false);
    expect(row).toMatchObject({ jobName: "crashy", jobId: job.id, payload: { userId: "u-1" } });
    expect(row?.error).toMatch(/stalled more than allowable limit/);
    await waitFor(async () => (await stateOf(queue, job.id ?? "")) === "failed");
  });

  it("a dead letter survives a failing DB write on the final attempt and keeps the original error", async () => {
    const queue = `t-${newId()}`;
    let writes = 0;
    const flakyRecord: RecordFailure = async (scope, row) => {
      writes++;
      if (writes === 1) throw new Error("Connection terminated unexpectedly");
      await recordFailedJob(scope, row);
    };
    const { worker: w, connection } = createQueueWorker(
      queue,
      async () => {
        throw new Error("smtp refused");
      },
      { concurrency: 1, recordFailure: flakyRecord },
    );
    open.push({
      close: async () => {
        await w.close();
        await connection.quit();
      },
    });
    const job = await getQueue(queue).add("doomed", {}, { attempts: 1 });
    const [row] = await waitFor(async () => {
      const rows = await db().select().from(failedJobs).where(eq(failedJobs.queue, queue));
      return rows.length > 0 ? rows : undefined;
    });
    expect(writes).toBe(2);
    expect(row).toMatchObject({ jobName: "doomed", jobId: job.id, attempts: 1 });
    expect(row?.error).toContain("smtp refused");
    expect(row?.error).not.toContain("Connection terminated");
    await waitFor(async () => (await stateOf(queue, job.id ?? "")) === "failed");
    expect((await getQueue(queue).getJob(job.id ?? ""))?.failedReason).toBe("smtp refused");
  });

  it("a malformed registry payload is dead-lettered at once (no pointless retries)", async () => {
    await getQueue("scheduled").obliterate({ force: true });
    const job = await getQueue("scheduled").add("heartbeat", { junk: 1 }, fast);
    open.push(startWorkers(["scheduled"]));
    const [row] = await waitFor(async () => {
      const rows = await db()
        .select()
        .from(failedJobs)
        .where(and(eq(failedJobs.queue, "scheduled"), eq(failedJobs.jobId, job.id ?? "")));
      return rows.length > 0 ? rows : undefined;
    });
    expect(row?.attempts).toBe(1);
    expect(row?.error).toMatch(/Invalid payload/);
  });
});

describe("[P0-04] scheduler", () => {
  it("registers schedules idempotently in Europe/London; removes only retired ones (CR-L2)", async () => {
    await getQueue("scheduled").obliterate({ force: true });
    const extra: ScheduleDef = {
      id: "probe",
      queue: "scheduled",
      name: "heartbeat",
      pattern: "0 6 * * *",
      data: {},
    };
    await registerSchedules();
    await registerSchedules(); // restart: must not double-register
    const keys = async (): Promise<string[]> =>
      (await getQueue("scheduled").getJobSchedulers()).map((s) => s.key).sort();
    expect(await keys()).toEqual(["heartbeat", "outbox-sweep"]);
    for (const s of await getQueue("scheduled").getJobSchedulers())
      expect(s).toMatchObject({ pattern: "* * * * *", tz: SCHEDULE_TZ });

    const base = await import("@/server/jobs/scheduler");
    // A newer release registered "probe"; this (older) code doesn't know it and must not delete it.
    await registerSchedules([...base.SCHEDULES, extra]);
    const older = await registerSchedules();
    expect(older).toMatchObject({ removed: [], unknown: ["probe"] });
    expect(await keys()).toEqual(["heartbeat", "outbox-sweep", "probe"]);
    // Retired in code: removed.
    const retired = await registerSchedules(base.SCHEDULES, ["probe"]);
    expect(retired).toMatchObject({ removed: ["probe"], unknown: [] });
    expect(await keys()).toEqual(["heartbeat", "outbox-sweep"]);
    // One next run per schedule, never two (BullMQ keeps each scheduler's next job delayed).
    expect(await getQueue("scheduled").getJobCountByTypes("delayed")).toBe(2);
    await expect(registerSchedules(base.SCHEDULES, ["heartbeat"])).rejects.toThrow(
      /both defined and retired/,
    );
  });
});
