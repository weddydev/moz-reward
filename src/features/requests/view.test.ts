import { describe, expect, it } from "vitest";
import { AMOUNT_PENCE_MAX, REJECT_REASONS, REQUEST_ITEMS } from "@/lib/requests";
import type { TeamRequest } from "@/server/repos/point-requests";
import {
  formatPence,
  NO_CARD_NAME,
  parseItems,
  parsePounds,
  queueRows,
  REJECT_REASON_LABELS,
} from "./view";

const NOW = new Date("2026-11-26T14:30:00Z"); // 14:30 in London (GMT)

const request = (over: Partial<TeamRequest> = {}): TeamRequest => ({
  id: "r1",
  status: "pending",
  requestedAt: new Date("2026-11-26T14:05:00Z"),
  amountPence: null,
  items: null,
  awardGold: null,
  member: { name: "Ana Lopes", memberId: "K7Q42M" }, // stored without the dash
  purchaseCount: 4,
  lastVisitAt: new Date("2026-11-20T10:00:00Z"),
  ...over,
});

const perPound = [
  {
    version: 1,
    activeFrom: new Date("2026-01-01T00:00:00Z"),
    rewardsFrom: new Date("2026-01-01T00:00:00Z"),
    earnMode: "per_pound" as const,
  },
];
const perVisitThenPound = [
  {
    version: 1,
    activeFrom: new Date("2026-01-01T00:00:00Z"),
    rewardsFrom: new Date("2026-01-01T00:00:00Z"),
    earnMode: "per_visit" as const,
  },
  {
    version: 2,
    activeFrom: new Date("2026-11-26T14:10:00Z"),
    rewardsFrom: new Date("2026-11-26T14:10:00Z"),
    earnMode: "per_pound" as const,
  },
];

describe("[P1-12] requests queue rows", () => {
  it("shows the member card, time, visits and last visit of a pending request", () => {
    const [row] = queueRows([request()], { versions: perPound, role: "staff", now: NOW });
    expect(row).toEqual({
      id: "r1",
      status: "pending",
      name: "Ana Lopes",
      memberId: "K7Q-42M",
      requestedAt: "14:05",
      requestedIso: "2026-11-26T14:05:00.000Z",
      visits: "4 visits",
      lastVisit: "Last visit 20 Nov 2026",
      amountRequired: true,
      proposal: null,
      canDecide: true,
      waiting: null,
    });
  });

  it("a request from yesterday carries its date; first and single visits read naturally", () => {
    const rows = queueRows(
      [
        request({
          requestedAt: new Date("2026-11-25T21:00:00Z"),
          purchaseCount: 0,
          lastVisitAt: null,
        }),
        request({ id: "r2", purchaseCount: 1 }),
      ],
      { versions: perPound, role: "owner", now: NOW },
    );
    expect(rows[0]).toMatchObject({
      requestedAt: "25 Nov 2026, 21:00",
      visits: "First visit",
      lastVisit: null,
    });
    expect(rows[1]?.visits).toBe("1 visit");
  });

  it("the earn rules come from the version active when the request was made (C-60)", () => {
    const rows = queueRows(
      [
        request({ requestedAt: new Date("2026-11-26T14:05:00Z") }),
        request({ id: "r2", requestedAt: new Date("2026-11-26T14:20:00Z") }),
      ],
      { versions: perVisitThenPound, role: "staff", now: NOW },
    );
    expect(rows.map((r) => r.amountRequired)).toEqual([false, true]);
    // No programme at all: nothing is required here; the server explains (NO_PROGRAMME).
    expect(
      queueRows([request()], { versions: [], role: "staff", now: NOW })[0]?.amountRequired,
    ).toBe(false);
  });

  it("an award waiting for the owner: the owner decides it with the proposal; staff see it waiting", () => {
    const waiting = request({
      status: "awaiting_owner",
      amountPence: 4250,
      items: ["Flat white", "Croissant"],
      awardGold: 43,
    });
    const [owner] = queueRows([waiting], { versions: perPound, role: "owner", now: NOW });
    expect(owner).toMatchObject({
      canDecide: true,
      waiting: null,
      proposal: {
        amountPence: 4250,
        items: ["Flat white", "Croissant"],
        gold: 43,
        text: "£42.50 · Flat white, Croissant · +43 gold",
      },
    });
    const [staff] = queueRows([waiting], { versions: perPound, role: "staff", now: NOW });
    expect(staff).toMatchObject({
      canDecide: false,
      waiting: "Waiting for the owner to approve +43 gold",
    });
    const [bare] = queueRows([request({ status: "awaiting_owner", awardGold: 5 })], {
      versions: perPound,
      role: "owner",
      now: NOW,
    });
    expect(bare?.proposal?.text).toBe("+5 gold");
  });

  it("a person with no card (erased account) shows as a member without an ID", () => {
    const [row] = queueRows([request({ member: null })], {
      versions: perPound,
      role: "staff",
      now: NOW,
    });
    expect(row).toMatchObject({ name: NO_CARD_NAME, memberId: null });
  });
});

describe("[P1-12] amount and items input", () => {
  it("reads pounds and pence, with or without £; empty means no amount", () => {
    expect(parsePounds("12.50")).toEqual({ ok: true, pence: 1250 });
    expect(parsePounds(" £8 ")).toEqual({ ok: true, pence: 800 });
    expect(parsePounds("0.29")).toEqual({ ok: true, pence: 29 });
    expect(parsePounds("4.5")).toEqual({ ok: true, pence: 450 });
    expect(parsePounds("")).toEqual({ ok: true, pence: null });
    expect(parsePounds("   ")).toEqual({ ok: true, pence: null });
  });

  it("refuses zero, negatives, more than 2 decimals, words and absurd amounts", () => {
    for (const bad of ["0", "0.00", "-5", "1.234", "ten", "1e3", "12,50", "£", "1.2.3"]) {
      expect(parsePounds(bad).ok, bad).toBe(false);
    }
    expect(parsePounds(String(AMOUNT_PENCE_MAX / 100))).toEqual({
      ok: true,
      pence: AMOUNT_PENCE_MAX,
    });
    expect(parsePounds(String(AMOUNT_PENCE_MAX / 100 + 1)).ok).toBe(false);
  });

  it("items: comma separated, trimmed, empty parts dropped, within the request limits", () => {
    expect(parseItems("Flat white, Croissant ,, ")).toEqual({
      ok: true,
      items: ["Flat white", "Croissant"],
    });
    expect(parseItems("  ")).toEqual({ ok: true, items: [] });
    const many = Array.from({ length: REQUEST_ITEMS.max + 1 }, (_, i) => `Item ${String(i)}`).join(
      ",",
    );
    expect(parseItems(many).ok).toBe(false);
    expect(parseItems("x".repeat(REQUEST_ITEMS.maxLength + 1)).ok).toBe(false);
    expect(parseItems("x".repeat(REQUEST_ITEMS.maxLength)).ok).toBe(true);
  });

  it("formats pence as UK pounds", () => {
    expect(formatPence(4250)).toBe("£42.50");
    expect(formatPence(100_000)).toBe("£1,000.00");
  });

  it("every reject reason has a label", () => {
    expect(Object.keys(REJECT_REASON_LABELS).sort()).toEqual([...REJECT_REASONS].sort());
    for (const r of REJECT_REASONS) expect(REJECT_REASON_LABELS[r].length).toBeGreaterThan(3);
  });
});
