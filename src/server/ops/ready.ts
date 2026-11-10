import "server-only";
import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { publicScope } from "@/server/authz/scope";
import { cacheRedis } from "@/server/cache";
import { env } from "@/server/env";
import { withScope } from "@/server/repos/_base";
import { limiterRedis } from "@/server/security/rate-limit";
import type { Redis } from "ioredis";

/**
 * Health endpoints (P0-13, ARCHITECTURE §11):
 *  - `/api/health/live`: the process answers. Public, no detail, no I/O.
 *  - `/api/health/ready`: this web process can serve (Postgres and redis-queue answer). Used by Caddy and
 *    deploys; 503 takes the container out of rotation. The worker is *not* part of it: a stopped worker must
 *    not take the web down.
 *  - `/api/health/worker`: the worker's health monitor ticked within 3 min (UptimeRobot, P0-15).
 * Everyone gets the status only. The per-check detail (latencies, cache, worker age) needs `x-health-token`
 * = HEALTH_TOKEN (compared in constant time); without HEALTH_TOKEN there is no detail at all. Results are
 * memoised for 2 s per process, so a flood of probes costs at most one DB and two Redis round trips per 2 s.
 */
type Check = { ok: boolean; ms: number };
export type ReadyReport = {
  ok: boolean;
  workerOk: boolean;
  checks: { db: Check; redis: Check; cache: Check; worker: { ok: boolean; ageSec: number | null } };
};

export type ReadyDeps = {
  db?: () => Promise<unknown>;
  redis?: () => Redis;
  cache?: () => Redis;
  now?: () => number;
};

const TIMEOUT_MS = 1_500;
const MEMO_MS = 2_000;
const WORKER_STALE_SEC = 180;
const HEALTH_SCOPE = publicScope("health check: SELECT 1, no table read");

async function probe(run: () => Promise<unknown>): Promise<Check> {
  const start = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("timeout"));
        }, TIMEOUT_MS);
      }),
    ]);
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  } finally {
    clearTimeout(timer);
  }
}

/** Same key as src/server/jobs/health-monitor.ts `monitorKey` (kept here so the web never imports jobs). */
const monitorKey = (): string => `${env().REDIS_KEY_PREFIX}health:monitor`;

export async function checkReady(deps: ReadyDeps = {}): Promise<ReadyReport> {
  const redis = deps.redis ?? limiterRedis;
  const cache = deps.cache ?? cacheRedis;
  const now = deps.now ?? Date.now;
  const db = deps.db ?? (() => withScope(HEALTH_SCOPE, (q) => q.execute(sql`SELECT 1`)));
  let workerAt: string | null = null;
  const [dbCheck, redisCheck, cacheCheck] = await Promise.all([
    probe(db),
    probe(async () => {
      workerAt = await redis().get(monitorKey());
    }),
    probe(() => cache().ping()),
  ]);
  const at = workerAt as string | null;
  const ageSec = at ? Math.max(0, Math.floor((now() - Date.parse(at)) / 1000)) : null;
  const workerOk = ageSec !== null && ageSec <= WORKER_STALE_SEC;
  return {
    ok: dbCheck.ok && redisCheck.ok,
    workerOk,
    checks: { db: dbCheck, redis: redisCheck, cache: cacheCheck, worker: { ok: workerOk, ageSec } },
  };
}

let cached: { at: number; report: Promise<ReadyReport> } | undefined;

function memoisedReady(): Promise<ReadyReport> {
  const t = Date.now();
  if (cached && t - cached.at < MEMO_MS) return cached.report;
  cached = { at: t, report: checkReady() };
  return cached.report;
}

/** Whether the request carries the health token (constant-time compare; no token configured = never). */
export function hasHealthToken(
  request: Request,
  expected: string | undefined = env().HEALTH_TOKEN,
): boolean {
  const given = request.headers.get("x-health-token");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const NO_STORE = { "cache-control": "no-store" } as const;

export function liveResponse(): Response {
  return Response.json({ status: "ok" }, { headers: NO_STORE });
}

export async function readyResponse(
  request: Request,
  report: () => Promise<ReadyReport> = memoisedReady,
  token: string | undefined = env().HEALTH_TOKEN,
): Promise<Response> {
  const r = await report();
  const body = hasHealthToken(request, token)
    ? { status: r.ok ? "ok" : "fail", checks: r.checks }
    : { status: r.ok ? "ok" : "fail" };
  return Response.json(body, { status: r.ok ? 200 : 503, headers: NO_STORE });
}

export async function workerResponse(
  report: () => Promise<ReadyReport> = memoisedReady,
): Promise<Response> {
  const r = await report();
  return Response.json(
    { status: r.workerOk ? "ok" : "fail" },
    { status: r.workerOk ? 200 : 503, headers: NO_STORE },
  );
}
