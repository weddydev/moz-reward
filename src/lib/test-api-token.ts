import { createHmac } from "node:crypto";

/**
 * Second wall on the test-only seeding API (SEC-L4, P0-14). APP_ENV=test is the first: the API is a 404
 * everywhere else. Inside a test environment every call must also carry this header, derived from the
 * environment's AUTH_SECRET, so a test server reachable by someone else (a shared port, a tunnel) still
 * can't be driven without the local secret. Pure (no server-only import) so E2E support code can use it.
 */
export const TEST_API_HEADER = "x-test-api-token";

export const testApiToken = (authSecret: string): string =>
  createHmac("sha256", authSecret).update("moz-rewards test API v1").digest("hex");
