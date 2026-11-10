import { UnrecoverableError } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireAdminRole } from "@/server/authz";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { failedJobs, outbox } from "@/server/db/schema";
import { writeOutbox } from "@/server/jobs/outbox";
import { closeQueues, dispatchJob, getQueue } from "@/server/jobs/queues";
import { defineJob, jobDef } from "@/server/jobs/registry";
import {
  LOST_AFTER_SEC,
  relayEnvelope,
  relayOnce,
  replayOutbox,
  STALE_AFTER_SEC,
  startRelay,
  sweepOutbox,
} from "@/server/jobs/relay";
import {
  createQueueWorker,
  jobProcessor,
  type Processor,
  UNKNOWN_JOB_GRACE_MS,
} from "@/server/jobs/worker";
import { transaction } from "@/server/repos/_base";
import { claimOutbox } from "@/server/repos/outbox";
import { opsAlert } from "@/server/security/alert";
import { makeActor } from "@/server/testing/factories";
import { tenantProbe } from "../support/tenant-job";

vi.mock("@/server/security/alert", () => ({ securityAlert: vi.fn(), opsAlert: vi.fn() }));
// A tenant job: requests may only write tenant jobs to the outbox (P0-20, C-30).
vi.mock("@/server/jobs/registry", async (importOriginal) =>
  (await import("../support/tenant-job")).withTenantProbe(await importOriginal()),
);

const SCOPE = systemScope("test: outbox");
const QUEUE = "email";
const JOB = "staff-lockout";
const lockoutDef = jobDef(QUEUE, JOB);
if (!lockoutDef) throw new Error("email:staff-lockout is not registered");

/** Side effects seen by the test worker, by outbox id: "exactly once" means one entry per id. */
let delivered: string[] = [];
/** Outbox ids whose handler fails for good (UnrecoverableError → dead letter at once). */
let poisoned = new Set<string>();
const open: { close: () => Promise<void> }[] = [];

/** A worker on the email queue whose handler records the delivery instead of sending mail. */
function countingWorker(): void {
  const processor: Processor = jobProcessor(QUEUE, (name) =>
    name === JOB
      ? {
          def: lockoutDef as NonNullable<typeof lockoutDef>,
          handler: async (_payload, job) => {
            if (poisoned.has(job.id ?? "")) throw new UnrecoverableError("poison payload");
            delivered.push(job.id ?? "?");
          },
        }
      : undefined,
  );
  const { worker, connection } = createQueueWorker(QUEUE, processor, { concurrency: 2 });
  open.push({
    close: async () => {
      await worker.close();
      await connection.quit();
    },
  });
}

async function waitFor(probe: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await probe())) {
    if (Date.now() > deadline) throw new Error("waitFor: timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

const row = async (id: string) => (await db().select().from(outbox).where(eq(outbox.id, id)))[0];

const write = (userId: string): Promise<string> =>
  transaction(SCOPE, (tx) => writeOutbox(SCOPE, tx, QUEUE, JOB, { userId, reason: "password" }));

/** Waits until the queue has nothing waiting or running (the worker drained what was dispatched). */
const drained = async (): Promise<boolean> => {
  const c = await getQueue(QUEUE).getJobCounts("waiting", "active", "delayed", "prioritized");
  return Object.values(c).every((n) => n === 0);
};

beforeEach(async () => {
  delivered = [];
  poisoned = new Set();
  await db().delete(outbox);
  await getQueue(QUEUE).obliterate({ force: true });
  vi.mocked(opsAlert).mockClear();
});

afterEach(async () => {
  await Promise.all(open.splice(0).map((o) => o.close()));
});

afterAll(async () => {
  await closeQueues();
});

describe("[P0-18] outbox writer and the action template", () => {
  const sendFromAction = defineAction({
    name: "test.outbox_send",
    input: z.object({ fail: z.boolean() }).strict(),
    authorize: (_i, p) => requireAdminRole(["owner"], p),
    transaction: true,
    handler: async ({ fail }, _scope, tools) => {
      const id = await tools.outbox(QUEUE, tenantProbe.name, { note: "from an action" });
      if (fail) throw new Error("boom after the outbox write");
      return id;
    },
  });
  const nonTransactional = defineAction({
    name: "test.outbox_no_tx",
    input: z.object({}).strict(),
    authorize: (_i, p) => requireAdminRole(["owner"], p),
    handler: (_i, _s, tools) => tools.outbox(QUEUE, tenantProbe.name, { note: "no tx" }),
  });
  const owner = async () => {
    const { user } = await makeActor("admin_owner");
    return loadPrincipal({ userId: user.id, mfaVerified: true, sessionCreatedAt: new Date() });
  };

  it("writes the row in the action's transaction: committed with it, rolled back with it", async () => {
    const admin = await owner();
    const ok = await runAsPrincipal(admin, () => sendFromAction({ fail: false }));
    if (!ok.ok) throw new Error("action failed");
    expect(await row(ok.data)).toMatchObject({
      queue: QUEUE,
      jobName: "tenant-probe",
      payload: { v: 1, data: { note: "from an action" } },
      dispatchedAt: null,
      completedAt: null,
      // C-30: the row records the scope that wrote it.
      scopeKind: "admin",
      scopeUserId: admin.userId,
      scopeShopId: null,
      scopeRole: "owner",
    });
    const failed = await runAsPrincipal(admin, () => sendFromAction({ fail: true }));
    expect(failed).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(await db().select().from(outbox)).toHaveLength(1);
  });

  it("refuses outbox() in a non-transactional action (it could not commit with the change)", async () => {
    const res = await runAsPrincipal(await owner(), () => nonTransactional({}));
    expect(res).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(await db().select().from(outbox)).toHaveLength(0);
  });

  it("validates the payload against the registry before writing", async () => {
    await expect(
      transaction(SCOPE, (tx) =>
        writeOutbox(SCOPE, tx, QUEUE, JOB, { userId: "not-a-uuid", reason: "password" }),
      ),
    ).rejects.toThrow();
    expect(await db().select().from(outbox)).toHaveLength(0);
  });

  it("the table refuses a blob payload (references, not data)", async () => {
    await expect(
      db()
        .insert(outbox)
        .values({
          queue: QUEUE,
          jobName: JOB,
          payload: { v: 1, data: { blob: "x".repeat(20_000) } },
        }),
    ).rejects.toThrow();
  });
});

describe("[P0-18] relay: delivered exactly once after a crash (AC1)", () => {
  it("a row committed before the process died is delivered once after restart; re-relaying adds nothing", async () => {
    const id = await write("0190a0b0-0000-7000-8000-000000000001");
    // The process "died" here: committed, never enqueued. On restart the relay finds it.
    countingWorker();
    expect(await relayOnce()).toMatchObject({ claimed: 1, dispatched: 1 });
    await waitFor(async () => (await row(id))?.completedAt != null);
    expect(await relayOnce()).toMatchObject({ claimed: 0 });
    await waitFor(drained);
    expect(delivered).toEqual([id]);
    expect((await row(id))?.dispatchedAt).not.toBeNull();
  });

  it("a relay that crashed mid-batch (enqueued, never marked) is finished by the next one without duplicates", async () => {
    const ids = [
      await write("0190a0b0-0000-7000-8000-000000000011"),
      await write("0190a0b0-0000-7000-8000-000000000012"),
      await write("0190a0b0-0000-7000-8000-000000000013"),
    ];
    // Crashed relay: claimed all three (lease 0 so the test needn't wait 30 s), enqueued two, marked none.
    const claimed = await claimOutbox(SCOPE, 10, 0);
    for (const r of claimed.slice(0, 2))
      await dispatchJob(r.queue, r.jobName, relayEnvelope(r), r.id);
    countingWorker();
    expect(await relayOnce()).toMatchObject({ claimed: 3, dispatched: 3 });
    await waitFor(async () => {
      const rows = await db().select().from(outbox);
      return rows.every((r) => r.completedAt != null);
    });
    await waitFor(drained);
    expect([...delivered].sort()).toEqual([...ids].sort());
  });

  it("a duplicate delivery of a completed row is a no-op in the worker", async () => {
    const id = await write("0190a0b0-0000-7000-8000-000000000021");
    countingWorker();
    await relayOnce();
    await waitFor(async () => (await row(id))?.completedAt != null);
    // BullMQ forgot the job (retention) and something dispatched the row again.
    await getQueue(QUEUE).obliterate({ force: true });
    const r = await row(id);
    if (!r) throw new Error("row missing");
    await dispatchJob(QUEUE, JOB, relayEnvelope(r), id);
    await waitFor(drained);
    expect(delivered).toEqual([id]);
  });

  it("Redis refusing the enqueue: the row backs off and keeps its place; the rest of the batch is released", async () => {
    const first = await write("0190a0b0-0000-7000-8000-000000000031");
    const second = await write("0190a0b0-0000-7000-8000-000000000032");
    let calls = 0;
    const res = await relayOnce({
      dispatch: () => {
        calls++;
        return Promise.reject(new Error("Command timed out"));
      },
    });
    expect(res).toEqual({ claimed: 2, dispatched: 0, failed: 2 });
    expect(calls).toBe(1); // the second row was not tried against a dead Redis
    for (const id of [first, second]) {
      const r = await row(id);
      expect(r).toMatchObject({
        attempts: 1,
        dispatchedAt: null,
        lastError: expect.stringMatching(/timed out/) as unknown,
      });
      expect((r?.nextAttemptAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(0);
    }
    expect(await relayOnce()).toMatchObject({ claimed: 0 }); // backing off
    await db()
      .update(outbox)
      .set({ nextAttemptAt: sql`now()` });
    countingWorker();
    expect(await relayOnce()).toMatchObject({ claimed: 2, dispatched: 2 });
    await waitFor(drained);
    expect([...delivered].sort()).toEqual([first, second].sort());
  });

  it("the running relay loop picks up new rows and stops cleanly", async () => {
    countingWorker();
    const relay = startRelay({ intervalMs: 50 });
    const id = await write("0190a0b0-0000-7000-8000-000000000041");
    await waitFor(async () => (await row(id))?.completedAt != null);
    await relay.stop();
    expect(delivered).toEqual([id]);
  });
});

describe("[P0-18] payload versioning across a deploy (AC4)", () => {
  const VQUEUE = "notifications";
  const id = "0190a0b0-0000-7000-8000-000000000051";
  const v2 = defineJob(
    z.object({ customerId: z.uuid(), channel: z.enum(["email", "push"]) }).strict(),
    {
      v: 2,
      upgrades: { 1: (d) => ({ customerId: (d as { userId: string }).userId, channel: "email" }) },
    },
  );
  const v1 = defineJob(z.object({ userId: z.uuid() }).strict());

  function versionedWorker(def: typeof v1 | typeof v2, seen: unknown[]): void {
    const { worker, connection } = createQueueWorker(
      VQUEUE,
      jobProcessor(VQUEUE, (name) =>
        name === "probe"
          ? {
              def,
              handler: async (payload) => {
                seen.push(payload);
              },
            }
          : undefined,
      ),
      { concurrency: 1 },
    );
    open.push({
      close: async () => {
        await worker.close();
        await connection.quit();
      },
    });
  }

  beforeEach(async () => {
    await getQueue(VQUEUE).obliterate({ force: true });
  });

  it("a job enqueued by version N is processed by a version N+1 worker", async () => {
    const job = await getQueue(VQUEUE).add("probe", { v: 1, data: { userId: id } });
    const seen: unknown[] = [];
    versionedWorker(v2, seen);
    await waitFor(async () => (await job.getState()) === "completed");
    expect(seen).toEqual([{ customerId: id, channel: "email" }]);
  });

  it("a job from version N+1 waits for a newer worker instead of failing on version N", async () => {
    const job = await getQueue(VQUEUE).add("probe", {
      v: 2,
      data: { customerId: id, channel: "push" },
    });
    const seen: unknown[] = [];
    versionedWorker(v1, seen);
    await waitFor(async () => (await job.getState()) === "delayed");
    expect(seen).toEqual([]);
    const fresh = await getQueue(VQUEUE).getJob(job.id ?? "");
    expect(fresh?.attemptsMade).toBe(0);
    expect(await db().select().from(failedJobs).where(eq(failedJobs.queue, VQUEUE))).toEqual([]);
  });
});

describe("[P0-18] reconciliation (AC6)", () => {
  it("reports and alerts on undispatched rows older than 2 min; fresh rows are not an incident", async () => {
    const old = await write("0190a0b0-0000-7000-8000-000000000061");
    await write("0190a0b0-0000-7000-8000-000000000062");
    await db()
      .update(outbox)
      .set({ createdAt: sql`now() - make_interval(secs => ${STALE_AFTER_SEC + 60})` })
      .where(eq(outbox.id, old));
    const report = await sweepOutbox();
    expect(report.stale).toMatchObject({
      count: 1,
      sample: [{ id: old, queue: QUEUE, jobName: JOB }],
    });
    expect(report.stale.oldestAgeSec).toBeGreaterThanOrEqual(STALE_AFTER_SEC + 59);
    expect(vi.mocked(opsAlert)).toHaveBeenCalledWith(
      "outbox.stale",
      expect.objectContaining({ count: 1 }),
    );
    expect(JSON.stringify(vi.mocked(opsAlert).mock.calls)).not.toMatch(/@/); // ids only
  });

  it("no stale rows: no alert", async () => {
    await write("0190a0b0-0000-7000-8000-000000000063");
    expect((await sweepOutbox()).stale.count).toBe(0);
    expect(vi.mocked(opsAlert)).not.toHaveBeenCalled();
  });

  it("prunes completed rows past retention and keeps recent ones", async () => {
    const gone = await write("0190a0b0-0000-7000-8000-000000000064");
    const kept = await write("0190a0b0-0000-7000-8000-000000000065");
    await db()
      .update(outbox)
      .set({
        dispatchedAt: sql`now() - interval '8 days'`,
        completedAt: sql`now() - interval '8 days'`,
      })
      .where(eq(outbox.id, gone));
    await db()
      .update(outbox)
      .set({
        dispatchedAt: sql`now() - interval '6 days'`,
        completedAt: sql`now() - interval '6 days'`,
      })
      .where(eq(outbox.id, kept));
    expect((await sweepOutbox()).pruned).toBe(1);
    expect(await row(gone)).toBeUndefined();
    expect(await row(kept)).toBeDefined();
  });
});

describe("[P0-18] replay after a restore (AC7)", () => {
  it("re-dispatches rows dispatched in the window and not complete; each side effect happens once", async () => {
    const make = async (n: number) => write(`0190a0b0-0000-7000-8000-00000000007${String(n)}`);
    const done = await make(1); // dispatched and completed before the backup
    const lost = await make(2); // dispatched before the backup, its job died with redis-queue
    const before = await make(3); // dispatched long before the window (already handled by then)
    const pending = await make(4); // never dispatched: the normal relay sends it
    const set = (id: string, dispatchedMinAgo: number, completed: boolean) =>
      db()
        .update(outbox)
        .set({
          dispatchedAt: sql`now() - make_interval(mins => ${dispatchedMinAgo})`,
          completedAt: completed
            ? sql`now() - make_interval(mins => ${dispatchedMinAgo - 1})`
            : null,
        })
        .where(eq(outbox.id, id));
    await set(done, 5, true);
    await set(lost, 5, false);
    await set(before, 60, false);

    // "Restore" into a fresh environment: the database comes back as it was at the backup, redis-queue empty.
    const snapshot = await db().select().from(outbox);
    await db().delete(outbox);
    await db().insert(outbox).values(snapshot);
    await getQueue(QUEUE).obliterate({ force: true });

    countingWorker();
    const since = new Date(Date.now() - 15 * 60_000); // restore point − 15 min
    expect(await replayOutbox(since)).toEqual({ replayed: 1 });
    expect(await relayOnce()).toMatchObject({ claimed: 1, dispatched: 1 }); // the never-dispatched row
    await waitFor(
      async () =>
        (await row(lost))?.completedAt != null && (await row(pending))?.completedAt != null,
    );
    await waitFor(drained);
    // Replay again (operator ran it twice): nothing more happens.
    expect(await replayOutbox(since)).toEqual({ replayed: 0 });
    await waitFor(drained);
    expect([...delivered].sort()).toEqual([lost, pending].sort());
  });

  it("pages through more rows than one batch (keyset), in dispatch order", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++)
      ids.push(await write(`0190a0b0-0000-7000-8000-0000000008${String(i)}0`));
    // Same dispatch time for two rows: the id breaks the tie.
    await db()
      .update(outbox)
      .set({ dispatchedAt: sql`now() - interval '1 minute'` });
    const seen: string[] = [];
    const res = await replayOutbox(new Date(Date.now() - 10 * 60_000), {
      batchSize: 2,
      dispatch: async (r) => {
        seen.push(r.id);
      },
    });
    expect(res).toEqual({ replayed: 5 });
    expect(seen).toEqual([...ids].sort());
  });
});

describe("[P0-18] review fixes: lost jobs, dead letters, unknown job names", () => {
  const ageDispatch = (id: string, sec: number) =>
    db()
      .update(outbox)
      .set({ dispatchedAt: sql`now() - make_interval(secs => ${sec})` })
      .where(eq(outbox.id, id));

  it("a dispatched job lost from redis-queue is re-dispatched by the sweep (once) and alerted", async () => {
    const lost = await write("0190a0b0-0000-7000-8000-000000000091");
    const queued = await write("0190a0b0-0000-7000-8000-000000000092");
    await relayOnce(); // both enqueued; no worker yet
    await getQueue(QUEUE).remove(lost); // the job vanished (AOF loss, flush)
    await ageDispatch(lost, LOST_AFTER_SEC + 60);
    await ageDispatch(queued, LOST_AFTER_SEC + 60); // still in the queue: re-dispatch is a no-op
    const report = await sweepOutbox();
    expect(report.redispatched).toBe(2);
    expect(vi.mocked(opsAlert)).toHaveBeenCalledWith(
      "outbox.lost",
      expect.objectContaining({ count: 2 }),
    );
    countingWorker();
    await waitFor(
      async () =>
        (await row(lost))?.completedAt != null && (await row(queued))?.completedAt != null,
    );
    await waitFor(drained);
    expect([...delivered].sort()).toEqual([lost, queued].sort());
    expect((await sweepOutbox()).redispatched).toBe(0);
  });

  it("a recently dispatched job is not treated as lost", async () => {
    await write("0190a0b0-0000-7000-8000-000000000093");
    await relayOnce();
    expect((await sweepOutbox()).redispatched).toBe(0);
  });

  it("a dead-lettered job closes its row: out of replay and the sweeps, pruned with the finished rows", async () => {
    const id = await write("0190a0b0-0000-7000-8000-000000000094");
    poisoned.add(id);
    countingWorker();
    await relayOnce();
    await waitFor(async () => (await row(id))?.failedAt != null);
    expect(await row(id)).toMatchObject({ completedAt: null });
    expect(delivered).toEqual([]);
    expect(await replayOutbox(new Date(Date.now() - 60 * 60_000))).toEqual({ replayed: 0 });
    await ageDispatch(id, LOST_AFTER_SEC + 60);
    expect((await sweepOutbox()).redispatched).toBe(0);
    await db()
      .update(outbox)
      .set({ failedAt: sql`now() - interval '8 days'` })
      .where(eq(outbox.id, id));
    expect((await sweepOutbox()).pruned).toBe(1);
    expect(await row(id)).toBeUndefined();
  });

  it("an unknown job name waits for a newer worker; past the grace period it is dead-lettered", async () => {
    countingWorker();
    const fresh = await getQueue(QUEUE).add("from-a-newer-release", { v: 1, data: {} });
    await waitFor(async () => (await fresh.getState()) === "delayed");
    expect(delivered).toEqual([]);
    const stale = await getQueue(QUEUE).add(
      "from-a-newer-release",
      { v: 1, data: {} },
      { timestamp: Date.now() - UNKNOWN_JOB_GRACE_MS - 60_000 },
    );
    await waitFor(async () => (await stale.getState()) === "failed");
    const [dead] = await db()
      .select()
      .from(failedJobs)
      .where(eq(failedJobs.jobId, stale.id ?? ""));
    expect(dead?.error).toMatch(/No handler/);
  });
});
