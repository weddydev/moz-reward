import "../scripts/load-env";
import { assertDatabaseReachable, prepareWorkerDatabases } from "./support/db";
import { ensureBucket } from "./support/storage";

/** Once per `vitest --project integration` run. Needs `pnpm services:up`. */
export default async function setup(): Promise<void> {
  await assertDatabaseReachable();
  await prepareWorkerDatabases();
  await ensureBucket();
}
