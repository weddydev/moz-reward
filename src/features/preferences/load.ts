import "server-only";
import { cookies } from "next/headers";
import type { AccountState } from "@/lib/preferences";
import { requireOwnAccount } from "@/server/authz";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import { ownPreferences } from "@/server/repos/profiles";

/**
 * What the root layout tells the browser about the caller's saved preferences:
 * - a customer profile's values;
 * - "none": signed out, or an account without a customer profile (staff, admin) → device-only;
 * - "unknown": the profile could not be read (database down) → the browser changes nothing.
 * A request without a session cookie costs no query.
 */
export async function loadAccountPreferences(): Promise<AccountState> {
  const jar = await cookies();
  if (!jar.getAll().some((c) => c.name.endsWith(".session_token"))) return "none";
  try {
    const { scope } = await requireOwnAccount();
    return (await ownPreferences(scope)) ?? "none";
  } catch (err) {
    if (err instanceof AppError && (err.code === "UNAUTHENTICATED" || err.code === "FORBIDDEN")) {
      return "none";
    }
    log().warn({ err }, "preferences: profile not readable; device values kept");
    return "unknown";
  }
}
