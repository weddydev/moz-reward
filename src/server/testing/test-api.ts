import "server-only";
import { env } from "@/server/env";

/** The seeding API exists only when APP_ENV=test (TESTING §6); everywhere else it is a plain 404. */
export const testApiEnabled = (): boolean => env().APP_ENV === "test";
