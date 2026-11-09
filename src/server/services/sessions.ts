import "server-only";
import { deviceLabel } from "@/lib/device-label";
import type { CustomerScope } from "@/server/authz/scope";
import { AppError } from "@/server/errors";
import { deleteAllOwnSessions, deleteOwnSession, listOwnSessions } from "@/server/repos/sessions";

/** One row of the signed-in devices list (SECURITY §2: session list + sign out everywhere). */
export type SignedInDevice = {
  id: string;
  device: string;
  signedInAt: Date;
  lastActiveAt: Date;
  current: boolean;
};

/** The caller's signed-in devices: this device first, then the most recently active. */
export async function listSignedInDevices(
  scope: CustomerScope,
  currentSessionId: string | null,
  now: Date = new Date(),
): Promise<SignedInDevice[]> {
  const rows = await listOwnSessions(scope, now);
  return rows
    .map((row) => ({
      id: row.id,
      device: deviceLabel(row.userAgent),
      signedInAt: row.createdAt,
      lastActiveAt: row.lastActiveAt,
      current: row.id === currentSessionId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/**
 * Signs one of the caller's other devices out. Someone else's session, or one already gone, looks the same
 * (NOT_FOUND), so ids can't be probed. This device is signed out with the normal sign-out instead.
 */
export async function signOutDevice(
  scope: CustomerScope,
  currentSessionId: string | null,
  sessionId: string,
): Promise<void> {
  if (sessionId === currentSessionId) {
    throw new AppError("VALIDATION", "Use Sign out to sign this device out.");
  }
  if (!(await deleteOwnSession(scope, sessionId))) {
    throw new AppError("NOT_FOUND", "That device is already signed out.");
  }
}

/** Signs the caller out on every device, this one included. Returns how many sessions ended. */
export async function signOutEverywhere(scope: CustomerScope): Promise<number> {
  return deleteAllOwnSessions(scope);
}
