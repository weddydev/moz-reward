import "server-only";
import { systemScope } from "@/server/authz/scope";
import { log as appLog } from "@/server/log";
import {
  CLAIM_LEASE_SEC,
  claimOutbox,
  markDispatched,
  markDispatchFailed,
  type OutboxRow,
  lostOutbox,
  pruneFinishedOutbox,
  replayCandidates,
  type ReplayCursor,
  staleOutbox,
} from "@/server/repos/outbox";
import { opsAlert } from "@/server/security/alert";
import { type Envelope, isEnvelope } from "./envelope";
import { dispatchJob } from "./queues";
import { redactText } from "./redact";

/**
 * Outbox relay (P0-18, ARCHITECTURE §6). Runs in the worker process: claims due rows (oldest first, leased,
 * `SKIP LOCKED`), enqueues each with `jobId = outbox.id`, marks it dispatched. A crash anywhere in a batch is
 * safe: unmarked rows are claimed again when their lease ends, and BullMQ ignores a job id it already holds.
 * The worker marks a row complete after its handler succeeds, so a replayed job is a no-op.
 */
const RELAY_SCOPE = systemScope("outbox relay: dispatches committed side effects for every tenant");

const log = (event: string, fields: Record<string, unknown>): void => {
  appLog()
    .child({ src: "relay" })
    .warn({ event, ...fields }, event);
};

export type Dispatch = (row: OutboxRow) => Promise<void>;

/** The row's envelope plus its outbox id, so the worker can find the row again. */
export function relayEnvelope(row: Pick<OutboxRow, "id" | "payload">): Envelope {
  const base: Envelope = isEnvelope(row.payload) ? row.payload : { v: 1, data: row.payload };
  return { ...base, outboxId: row.id };
}

const defaultDispatch: Dispatch = (row) =>
  dispatchJob(row.queue, row.jobName, relayEnvelope(row), row.id);

/** Seconds before the next try after `attempts` failed dispatches: 1, 2, 4 … capped at 5 min. */
export const retryDelaySec = (attempts: number): number =>
  Math.min(2 ** Math.max(0, attempts - 1), 300);

const message = (err: unknown): string =>
  redactText(err instanceof Error ? `${err.name}: ${err.message}` : String(err));

/**
 * One batch. On the first failed enqueue (usually Redis down) the rest of the batch is released with the same
 * backoff instead of each waiting out its own timeout.
 */
export async function relayOnce(
  opts: { batchSize?: number; leaseSec?: number; dispatch?: Dispatch } = {},
): Promise<{ claimed: number; dispatched: number; failed: number }> {
  const dispatch = opts.dispatch ?? defaultDispatch;
  const rows = await claimOutbox(
    RELAY_SCOPE,
    opts.batchSize ?? 100,
    opts.leaseSec ?? CLAIM_LEASE_SEC,
  );
  const done: string[] = [];
  let failure: string | undefined;
  for (const row of rows) {
    if (failure === undefined) {
      try {
        await dispatch(row);
        done.push(row.id);
        continue;
      } catch (err) {
        failure = message(err);
        log("relay.dispatch_failed", {
          id: row.id,
          queue: row.queue,
          job: row.jobName,
          error: failure,
        });
      }
    }
    await markDispatchFailed(RELAY_SCOPE, row.id, failure, retryDelaySec(row.attempts));
  }
  await markDispatched(RELAY_SCOPE, done);
  return { claimed: rows.length, dispatched: done.length, failed: rows.length - done.length };
}

export type RunningRelay = { stop: () => Promise<void> };

/**
 * Polls every `intervalMs` (1 s); a full batch is followed by the next one at once. `stop()` lets the current
 * batch finish (graceful shutdown) and resolves when the loop has exited.
 */
export function startRelay(opts: { intervalMs?: number; batchSize?: number } = {}): RunningRelay {
  const intervalMs = opts.intervalMs ?? 1_000;
  const batchSize = opts.batchSize ?? 100;
  // Read through a function: `stop()` flips it while the loop awaits, which control-flow narrowing can't see.
  const state = { stopped: false };
  const stopping = (): boolean => state.stopped;
  let wake: (() => void) | undefined;
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  const loop = (async () => {
    while (!stopping()) {
      let full = false;
      try {
        full = (await relayOnce({ batchSize })).claimed === batchSize;
      } catch (err) {
        // Database unreachable: keep polling; rows wait safely in Postgres.
        log("relay.batch_failed", { error: message(err) });
      }
      if (!full && !stopping()) await sleep(intervalMs);
    }
  })();
  return {
    stop: async () => {
      state.stopped = true;
      wake?.();
      await loop;
    },
  };
}

/**
 * Replay after a restore (RUNBOOK; ARCHITECTURE §9): re-dispatches every row dispatched at or after `since`
 * whose side effect is not recorded as done. `since` = restore point − N minutes, because jobs that were in
 * redis-queue when the host died are gone. Safe to run twice: same job ids, and completed rows are skipped.
 */
export async function replayOutbox(
  since: Date,
  opts: { batchSize?: number; dispatch?: Dispatch; dryRun?: boolean } = {},
): Promise<{ replayed: number }> {
  const dispatch: Dispatch = opts.dryRun
    ? async () => undefined
    : (opts.dispatch ?? defaultDispatch);
  const batchSize = opts.batchSize ?? 500;
  let after: ReplayCursor | null = null;
  let replayed = 0;
  for (;;) {
    const rows = await replayCandidates(RELAY_SCOPE, since, after, batchSize);
    for (const row of rows) {
      await dispatch(row);
      replayed++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < batchSize) break;
    after = last.cursor;
  }
  log(opts.dryRun ? "relay.replay_dry_run" : "relay.replayed", {
    since: since.toISOString(),
    replayed,
  });
  return { replayed };
}

/** Rows waiting longer than this are an incident (ARCHITECTURE §6). */
export const STALE_AFTER_SEC = 120;
/**
 * A dispatched row still open after this long has most likely lost its job (redis-queue AOF loss or flush, or
 * no worker for its queue). Generous: retries with backoff and deferred jobs finish well inside it.
 */
export const LOST_AFTER_SEC = 10 * 60;
/** Finished rows (completed or dead-lettered) are kept this long; a restore brings back its own point in time. */
export const OUTBOX_RETENTION_DAYS = 7;

/**
 * Reconciliation (scheduled every minute, AC6): alerts when any undispatched row is older than 2 min;
 * re-dispatches rows whose job was lost (same job id, so a job still in the queue is untouched and a completed
 * row is skipped by the worker) and alerts on them; prunes one batch of finished rows past retention.
 */
export async function sweepOutbox(opts: { dispatch?: Dispatch } = {}): Promise<{
  stale: Awaited<ReturnType<typeof staleOutbox>>;
  redispatched: number;
  pruned: number;
}> {
  const dispatch = opts.dispatch ?? defaultDispatch;
  const stale = await staleOutbox(RELAY_SCOPE, STALE_AFTER_SEC);
  if (stale.count > 0) {
    opsAlert("outbox.stale", {
      count: stale.count,
      oldestAgeSec: stale.oldestAgeSec,
      sample: stale.sample,
    });
  }
  const lost = await lostOutbox(RELAY_SCOPE, LOST_AFTER_SEC, 100);
  let redispatched = 0;
  for (const row of lost) {
    await dispatch(row);
    redispatched++;
  }
  if (lost.length > 0) {
    opsAlert("outbox.lost", {
      count: lost.length,
      sample: lost.slice(0, 10).map((r) => ({ id: r.id, queue: r.queue, jobName: r.jobName })),
    });
  }
  const pruned = await pruneFinishedOutbox(RELAY_SCOPE, OUTBOX_RETENTION_DAYS, 1_000);
  return { stale, redispatched, pruned };
}

/**
 * `--replay-since` value: an ISO 8601 time **with** a zone (`2026-11-10T09:30:00Z` or `+00:00`), not in the
 * future. A zone-less time is refused: during BST it would silently replay the wrong hour.
 */
export function parseReplaySince(
  arg: string | undefined,
  now: Date = new Date(),
): { ok: true; since: Date } | { ok: false; error: string } {
  if (!arg) return { ok: false, error: "--replay-since <ISO time with zone> is required" };
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      arg,
    );
  if (!m) {
    return { ok: false, error: `not an ISO time with a zone (e.g. 2026-11-10T09:30:00Z): ${arg}` };
  }
  // Optional groups (seconds) are undefined at run time, whatever RegExpExecArray's type says.
  const [y, mo, d, h, mi, sec] = (m.slice(1) as (string | undefined)[]).map((x) =>
    x === undefined ? 0 : Number(x),
  );
  // Date rolls 30 Feb over to 2 Mar; check the calendar fields ourselves.
  const day = new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 0));
  const since = new Date(arg);
  if (
    Number.isNaN(since.getTime()) ||
    day.getUTCMonth() !== (mo ?? 0) - 1 ||
    day.getUTCDate() !== d ||
    (h ?? 0) > 23 ||
    (mi ?? 0) > 59 ||
    (sec ?? 0) > 59
  ) {
    return { ok: false, error: `not a valid time: ${arg}` };
  }
  if (since.getTime() > now.getTime()) return { ok: false, error: `in the future: ${arg}` };
  return { ok: true, since };
}
