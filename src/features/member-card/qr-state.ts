/**
 * What the member card's back shows (P1-14; PRODUCT §18 "Offline member QR"). Pure, so the rules are unit-tested
 * and the offline shell and the live card share them.
 *
 * The token's lifetime is counted on the phone's own clock from the moment the response arrived (the server's
 * `serverNow`/`expiresAt` give the length, so a phone clock that is minutes out doesn't matter), capped at the
 * 5-minute lifetime whatever the response says. A clock that moves backwards counts as expired. The QR goes a
 * little before expiry, so staff never scan a code the server will refuse.
 */

/** The `GET /api/me/member-qr` response (times in ms since the epoch, server clock). */
export type CardToken = {
  token: string;
  /** Formatted `XXX-XXX`. */
  memberId: string;
  firstName: string;
  serverNow: number;
  expiresAt: number;
};

/** PRODUCT §18, word for word. */
export const OFFLINE_NOTE = "Offline — ask staff to type your member ID";

export const TOKEN_LIFETIME_MS = 5 * 60_000;
export const REFRESH_AFTER_MS = 4 * 60_000;
export const HIDE_BEFORE_EXPIRY_MS = 10_000;

export type QrView =
  | { kind: "qr" }
  /** No usable token and online: a new one is on its way. */
  | { kind: "refreshing" }
  | { kind: "loading" }
  /** Offline, the token expired: the member ID large with "Offline — ask staff to type your member ID". */
  | { kind: "member-id-offline" }
  /** Offline and no card was ever cached on this phone. */
  | { kind: "offline-no-card" };

export function tokenExpiresLocally(token: CardToken, receivedAt: number): number {
  const lifetime = Math.min(Math.max(token.expiresAt - token.serverNow, 0), TOKEN_LIFETIME_MS);
  return receivedAt + lifetime;
}

export function qrView({
  token,
  receivedAt,
  now,
  online,
}: {
  token: CardToken | null;
  receivedAt: number | null;
  now: number;
  online: boolean;
}): QrView {
  if (!token || receivedAt === null) return { kind: online ? "loading" : "offline-no-card" };
  const fresh =
    now >= receivedAt && now < tokenExpiresLocally(token, receivedAt) - HIDE_BEFORE_EXPIRY_MS;
  if (fresh) return { kind: "qr" };
  return { kind: online ? "refreshing" : "member-id-offline" };
}

/** Milliseconds until the next refresh (0: now). */
export function refreshDelay(receivedAt: number | null, now: number): number {
  if (receivedAt === null || now < receivedAt) return 0;
  return Math.max(receivedAt + REFRESH_AFTER_MS - now, 0);
}

/** Back to the tab or back online: refetch only if the token is nearly done (design check M4). */
export const REFETCH_WHEN_LEFT_MS = 90_000;
export function refetchOnWake(
  token: CardToken | null,
  receivedAt: number | null,
  now: number,
): boolean {
  if (!token || receivedAt === null || now < receivedAt) return true;
  return (
    refreshDelay(receivedAt, now) === 0 ||
    tokenExpiresLocally(token, receivedAt) - now < REFETCH_WHEN_LEFT_MS
  );
}

/**
 * Whether a cached card may still be used (design check H1): younger than its `cacheUntil` (a day) on the phone's
 * clock, counted from when it arrived; a clock behind that moment drops it too.
 */
export function cardKept(
  card: { serverNow: number; cacheUntil: number },
  receivedAt: number,
  now: number,
): boolean {
  return now >= receivedAt && now - receivedAt < card.cacheUntil - card.serverNow;
}
