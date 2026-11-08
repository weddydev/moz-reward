import { truncateAll, workerDbUrl } from "./support/db";

// Runs before every integration test file, inside its worker.
const poolId = process.env.VITEST_POOL_ID ?? "1";
const url = workerDbUrl(poolId);
process.env.DATABASE_URL = url;
process.env.DATABASE_URL_MIGRATIONS = url;
process.env.REDIS_KEY_PREFIX = `test:w${poolId}:`;
await truncateAll(url);
