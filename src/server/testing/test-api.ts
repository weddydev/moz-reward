import "server-only";
import { timingSafeEqual } from "node:crypto";
import { TEST_API_HEADER, testApiToken } from "@/lib/test-api-token";
import { env } from "@/server/env";

/** The seeding API exists only when APP_ENV=test (TESTING §6); everywhere else it is a plain 404. */
export const testApiEnabled = (): boolean => env().APP_ENV === "test";

/**
 * APP_ENV=test **and** the request carries the token derived from AUTH_SECRET (SEC-L4). A missing or wrong
 * token gets the same 404 as a disabled API, so the route never confirms it exists.
 */
export function testApiAllowed(req: Request): boolean {
  if (!testApiEnabled()) return false;
  const given = Buffer.from(req.headers.get(TEST_API_HEADER) ?? "");
  const expected = Buffer.from(testApiToken(env().AUTH_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
