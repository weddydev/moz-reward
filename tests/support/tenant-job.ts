/**
 * A tenant job for tests (P0-20, C-30). No real tenant job exists yet (P1 adds them), so tests that write
 * outbox rows from a customer/shop/admin request register this one through a registry mock:
 *
 *   vi.mock("@/server/jobs/registry", async (importOriginal) =>
 *     (await import("../support/tenant-job")).withTenantProbe(await importOriginal()));
 *
 * `email:tenant-probe` runs as the request's scope; its payload may name a shop (to prove that a payload
 * naming another shop gets nothing under RLS).
 */
import { z } from "zod";
import type * as Registry from "@/server/jobs/registry";

export const TENANT_QUEUE = "email";
export const TENANT_JOB = "tenant-probe";

export const tenantProbeSchema = z
  .object({ note: z.string().max(100), shopId: z.uuid().optional() })
  .strict();

export function withTenantProbe(actual: typeof Registry): typeof Registry {
  const jobs = {
    ...actual.JOBS,
    email: {
      ...actual.JOBS.email,
      [TENANT_JOB]: actual.defineJob(tenantProbeSchema, { runAs: "tenant" }),
    },
  } as unknown as typeof actual.JOBS;
  const jobDef: typeof actual.jobDef = (queue, name) => {
    if (!Object.hasOwn(jobs, queue)) return undefined;
    const forQueue = jobs[queue as Registry.QueueName] as Record<string, Registry.JobDef>;
    return Object.hasOwn(forQueue, name) ? forQueue[name] : undefined;
  };
  return { ...actual, JOBS: jobs, jobDef };
}

/** The probe's typed name, cast for APIs typed from the real registry. */
export const tenantProbe = { queue: TENANT_QUEUE, name: TENANT_JOB as never } as const;
