import { describe, expect, it } from "vitest";
import type { ReceiptData } from "@/server/db/schema";
import {
  parseReceiptData,
  pdfText,
  receiptHeader,
  receiptLines,
  renderReceiptPdf,
} from "./receipt-pdf";

const data = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  shopName: "Joe's Café",
  address: "1 High St, Leeds, LS1 1AA",
  vatNumber: null,
  requestedAt: "2026-11-07T13:58:00.000Z",
  approvedAt: "2026-11-07T14:05:00.000Z",
  items: ["Flat white", "Croissant"],
  amountPence: 1250,
  goldEarned: 12,
  bonusGold: 0,
  staffInitials: "MS",
  ...over,
});

describe("[P1-12] receipt PDF text", () => {
  it("keeps WinAnsi text, strips accents it can't draw, drops emoji and controls", () => {
    expect(pdfText("Joe's Café — £5 “best”", 100)).toBe("Joe's Café — £5 “best”");
    expect(pdfText("Café ☕ 🍰", 100)).toBe("Café");
    expect(pdfText("Zażółć", 100)).toBe("Zazó?c");
    expect(pdfText("مقهى 東京", 100)).toBe("???? ??");
    expect(pdfText("a\u0000b\u200bc\u202Ed", 100)).toBe("abcd");
    expect(pdfText("  two\n\tlines  ", 100)).toBe("two lines");
    expect(pdfText("abcdef", 3)).toBe("abc");
  });

  it("lists number, UK date and 24 h time, items, amount, gold and initials", () => {
    expect(receiptLines(42, data())).toEqual([
      ["Receipt no.", "42"],
      ["Date", "7 Nov 2026, 14:05"],
      ["Items", "Flat white\nCroissant"],
      ["Amount", "£12.50"],
      ["Gold earned", "12"],
      ["Approved by", "MS"],
    ]);
  });

  it("shows the streak bonus and total only when there is a bonus, and no amount or items when absent", () => {
    const lines = receiptLines(1_234, data({ amountPence: null, items: [], bonusGold: 5 }));
    expect(lines).toEqual([
      ["Receipt no.", "1,234"],
      ["Date", "7 Nov 2026, 14:05"],
      ["Gold earned", "12"],
      ["Streak bonus", "5"],
      ["Total gold", "17"],
      ["Approved by", "MS"],
    ]);
  });

  it("uses UK time across BST (summer approval shows +1 h)", () => {
    expect(receiptLines(1, data({ approvedAt: "2026-07-01T08:30:00.000Z" }))[1]).toEqual([
      "Date",
      "1 Jul 2026, 09:30",
    ]);
  });

  it("shows the VAT number only when the shop set one", () => {
    expect(receiptHeader(data())).toEqual(["Joe's Café", "1 High St, Leeds, LS1 1AA"]);
    expect(receiptHeader(data({ vatNumber: "GB123456789", address: null }))).toEqual([
      "Joe's Café",
      "VAT no. GB123456789",
    ]);
  });

  it("never draws customer data: only the snapshot's fields reach the page", () => {
    const text = JSON.stringify([receiptHeader(data()), receiptLines(1, data())]);
    expect(text).not.toMatch(/@|\+44|member/i);
  });
});

describe("[P1-12] receipt PDF snapshot check", () => {
  it("accepts a real snapshot, including an emoji or RTL shop name", () => {
    expect(parseReceiptData(data())).toEqual(data());
    expect(parseReceiptData(data({ shopName: "مقهى ☕" }))).not.toBeNull();
  });

  it.each([
    ["an extra key", { ...data(), email: "a@b.c" }],
    ["a missing field", { ...data(), goldEarned: undefined }],
    ["a fractional amount", data({ amountPence: 1.5 })],
    ["a negative bonus", data({ bonusGold: -1 })],
    ["eleven items", data({ items: Array.from({ length: 11 }, () => "x") })],
    ["long initials", data({ staffInitials: "ABCD" })],
    ["a bad date", data({ approvedAt: "yesterday" })],
    ["not an object", "receipt"],
  ])("rejects %s", (_label, value) => {
    expect(parseReceiptData(value)).toBeNull();
  });
});

describe("[P1-12] receipt PDF bytes", () => {
  it("renders a one-page PDF 1.7, the same bytes every time", async () => {
    const a = await renderReceiptPdf(7, data());
    const b = await renderReceiptPdf(7, data());
    expect(a.subarray(0, 8).toString("latin1")).toBe("%PDF-1.7");
    expect(a.equals(b)).toBe(true);
    expect(a.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it("has no links, annotations, scripts, forms, attachments, launch actions or encryption", async () => {
    const pdf = (
      await renderReceiptPdf(7, data({ shopName: "https://evil.example javascript:alert(1)" }))
    ).toString("latin1");
    for (const name of [
      "/Annot",
      "/URI",
      "/JavaScript",
      "/JS",
      "/EmbeddedFile",
      "/OpenAction",
      "/AcroForm",
      "/Launch",
      "/Encrypt",
    ]) {
      expect(pdf, name).not.toContain(name);
    }
  });
});
