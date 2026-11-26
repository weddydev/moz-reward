import { describe, expect, it } from "vitest";
import {
  cardKept,
  type CardToken,
  HIDE_BEFORE_EXPIRY_MS,
  qrView,
  REFRESH_AFTER_MS,
  refreshDelay,
  refetchOnWake,
  tokenExpiresLocally,
} from "./qr-state";

const MIN = 60_000;
// The server said "now" is 12:00:00 and the token lasts 5 min; the phone's clock is 7 minutes behind.
const token: CardToken = {
  token: "MQ1.x",
  memberId: "ABC-123",
  firstName: "Ada",
  serverNow: Date.UTC(2026, 10, 26, 12, 0, 0),
  expiresAt: Date.UTC(2026, 10, 26, 12, 5, 0),
};
const receivedAt = Date.UTC(2026, 10, 26, 11, 53, 0);

describe("[P1-14] member QR view (offline and expiry rules)", () => {
  it("[P1-14] counts the expiry on the phone's clock from when the response arrived", () => {
    expect(tokenExpiresLocally(token, receivedAt)).toBe(receivedAt + 5 * MIN);
  });

  it("[P1-14] shows the QR while the token is fresh, online or offline", () => {
    for (const online of [true, false]) {
      expect(qrView({ token, receivedAt, now: receivedAt + MIN, online })).toEqual({ kind: "qr" });
    }
  });

  it("[P1-14] hides the QR shortly before expiry so staff never scan a dead code", () => {
    const edge = receivedAt + 5 * MIN - HIDE_BEFORE_EXPIRY_MS;
    expect(qrView({ token, receivedAt, now: edge - 1, online: false }).kind).toBe("qr");
    expect(qrView({ token, receivedAt, now: edge, online: false }).kind).toBe("member-id-offline");
  });

  it("[P1-14] offline with an expired token shows the member ID, never a stale QR", () => {
    expect(qrView({ token, receivedAt, now: receivedAt + 10 * MIN, online: false })).toEqual({
      kind: "member-id-offline",
    });
  });

  it("[P1-14] online with an expired token waits for a new one (no stale QR)", () => {
    expect(qrView({ token, receivedAt, now: receivedAt + 10 * MIN, online: true })).toEqual({
      kind: "refreshing",
    });
  });

  it("[P1-14] with no token: loading online, member ID unknown offline", () => {
    expect(qrView({ token: null, receivedAt: null, now: receivedAt, online: true }).kind).toBe(
      "loading",
    );
    expect(qrView({ token: null, receivedAt: null, now: receivedAt, online: false }).kind).toBe(
      "offline-no-card",
    );
  });

  it("[P1-14] a phone clock that jumps backwards never extends the QR past its lifetime", () => {
    // now before receivedAt (clock moved back): treated as expired, not as 5 more minutes.
    expect(qrView({ token, receivedAt, now: receivedAt - 2 * MIN, online: false }).kind).toBe(
      "member-id-offline",
    );
  });

  it("[P1-14] a token whose lifetime is longer than 5 minutes is not trusted for longer", () => {
    const long = { ...token, expiresAt: token.serverNow + 60 * MIN };
    expect(tokenExpiresLocally(long, receivedAt)).toBe(receivedAt + 5 * MIN);
  });

  it("[P1-14] refreshes 4 minutes after the token arrived, at once when overdue", () => {
    expect(REFRESH_AFTER_MS).toBe(4 * MIN);
    expect(refreshDelay(receivedAt, receivedAt + MIN)).toBe(3 * MIN);
    expect(refreshDelay(receivedAt, receivedAt + 9 * MIN)).toBe(0);
    expect(refreshDelay(null, receivedAt)).toBe(0);
  });

  it("[P1-14] on wake or reconnect refetches only when under 90 s are left or 4 minutes have passed", () => {
    // Keeps the issue route well under its hourly limit (design check M4).
    expect(refetchOnWake(token, receivedAt, receivedAt + MIN)).toBe(false);
    expect(refetchOnWake(token, receivedAt, receivedAt + 4 * MIN)).toBe(true);
    expect(
      refetchOnWake(
        { ...token, expiresAt: token.serverNow + 100_000 },
        receivedAt,
        receivedAt + 11_000,
      ),
    ).toBe(true);
    expect(refetchOnWake(null, null, receivedAt)).toBe(true);
    expect(refetchOnWake(token, receivedAt, receivedAt - 1)).toBe(true);
  });

  it("[P1-14] a cached card is kept for a day from when it arrived, never longer", () => {
    const card = { serverNow: token.serverNow, cacheUntil: token.serverNow + 24 * 60 * MIN };
    expect(cardKept(card, receivedAt, receivedAt + 23 * 60 * MIN)).toBe(true);
    expect(cardKept(card, receivedAt, receivedAt + 24 * 60 * MIN)).toBe(false);
    expect(cardKept(card, receivedAt, receivedAt - 1)).toBe(false);
  });
});
