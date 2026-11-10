import { inject } from "vitest";
import { setDbProcess } from "@/server/db/client";
import { truncateAll, workerDbUrl, workerRoleUrl } from "./support/db";

// Runs before every integration test file, inside its worker. App code connects as the RLS roles (P0-20);
// fixtures and checks use the owner URL (testOwnerDb, DATABASE_URL_MIGRATIONS).
const poolId = process.env.VITEST_POOL_ID ?? "1";
const url = workerDbUrl(poolId);
process.env.DATABASE_URL = workerRoleUrl(poolId, "moz_app");
process.env.DATABASE_URL_AUTH = workerRoleUrl(poolId, "moz_auth");
process.env.DATABASE_URL_WORKER = workerRoleUrl(poolId, "moz_worker");
process.env.DATABASE_URL_MIGRATIONS = url;
// Per run as well as per worker: a process left over from an earlier run can't take this run's jobs.
process.env.REDIS_KEY_PREFIX = `test:${inject("redisRunId")}:w${poolId}:`;
// Web and worker code share this process: all three role pools (each still its own RLS role).
setDbProcess("test");
await truncateAll(url);
