import { describe, expect, it } from "vitest";
import { refusalMessage, SCAN_COPY, scanRow, type VerifyFound } from "./view";

const NOW = new Date("2026-11-28T14:30:00Z");
const found: VerifyFound = {
  status: "ok",
  memberId: "K7Q-42M",
  name: "Aisha Khan",
  purchaseCount: 4,
  lastVisitIso: "2026-11-20T10:00:00.000Z",
  streak: { weeks: 2, lastWeekStart: "2026-11-16" },
  openRequest: null,
};
const version = (earnMode: "per_pound" | "per_visit", from: string) => ({
  version: 1,
  activeFrom: new Date(from),
  rewardsFrom: new Date(from),
  earnMode,
});

describe("[P2-02] scanner view", () => {
  it("[P2-02] the award row is the member, now, with the rules active now", () => {
    const row = scanRow(found, [version("per_pound", "2026-01-01T00:00:00Z")], NOW);
    expect(row).toMatchObject({
      name: "Aisha Khan",
      memberId: "K7Q-42M",
      status: "pending",
      requestedIso: NOW.toISOString(),
      visits: "4 visits",
      lastVisit: "Last visit 20 Nov 2026",
      amountRequired: true,
      proposal: null,
      canDecide: true,
    });
    const first = scanRow(
      { ...found, purchaseCount: 0, lastVisitIso: null },
      [version("per_visit", "2026-01-01T00:00:00Z")],
      NOW,
    );
    expect(first).toMatchObject({ visits: "First visit", lastVisit: null, amountRequired: false });
    expect(scanRow({ ...found, purchaseCount: 1 }, [], NOW)).toMatchObject({
      visits: "1 visit",
      amountRequired: false,
    });
  });

  it("[P2-02] refusals: one answer for every non-member, the path decides the invalid wording", () => {
    expect(refusalMessage("not_member", "qr")).toBe(refusalMessage("not_member", "member_id"));
    expect(refusalMessage("not_member", "qr")).toMatch(/scan the shop QR first/);
    expect(refusalMessage("invalid", "qr")).toBe(SCAN_COPY.otherQr);
    expect(refusalMessage("invalid", "member_id")).toBe(SCAN_COPY.memberIdInvalid);
    expect(refusalMessage("expired", "qr")).toMatch(/expired/);
    expect(refusalMessage("self", "qr")).toMatch(/your own member card/);
  });
});
