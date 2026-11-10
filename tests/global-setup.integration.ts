import "../scripts/load-env";
import { assertDatabaseReachable, prepareWorkerDatabases } from "./support/db";
import { ensureBucket } from "./support/storage";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Unique per run: Redis keys and BullMQ queues of one run never meet another run's leftovers. */
    redisRunId: string;
  }
}

/** Once per `vitest --project integration` run. Needs `pnpm services:up`. */
export default async function setup(project: TestProject): Promise<void> {
  project.provide("redisRunId", Date.now().toString(36));
  await assertDatabaseReachable();
  await prepareWorkerDatabases();
  await ensureBucket();
}
