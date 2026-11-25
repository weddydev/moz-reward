import "server-only";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { formatDate, formatTime } from "@/lib/format-date";
import type { ReceiptData } from "@/server/db/schema";

/**
 * The digital receipt PDF (P1-12, PRODUCT §11), rendered in the worker only (pdfkit never reaches the web
 * bundle: ESLint allows its import in this file alone, and the routes only stream the stored bytes).
 *
 * Built from the receipt's snapshot and number alone, so it carries no customer data (no name, email, phone or
 * member id) and can be regenerated from the database at any time. Standard Helvetica only: no font files, no
 * images, no links, annotations, attachments, forms or scripts. The info dictionary is fixed and dated by the
 * approval, so the same receipt always renders to the same bytes (a retried job overwrites with identical
 * content).
 */

export const RECEIPT_TITLE = "Digital receipt — not a VAT invoice";

/** Longest text drawn per field (the snapshot is already bounded at approval; this is the renderer's own cap). */
const MAX = {
  shopName: 120,
  address: 300,
  vatNumber: 40,
  item: 60,
  items: 10,
  initials: 3,
} as const;

/** Characters the standard fonts' WinAnsi encoding has beyond Latin-1 (pdfkit's map). */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const isWinAnsi = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch);
};

/**
 * Text the standard fonts can draw: control and format characters, emoji and symbols are dropped; accented
 * letters outside WinAnsi lose their accent (NFKD); any other letter becomes "?". Whitespace collapses to one
 * space, and the result is cut to `max` characters.
 */
export function pdfText(input: string, max: number): string {
  let out = "";
  for (const ch of input.normalize("NFC")) {
    if (/\s/u.test(ch)) {
      out += " ";
    } else if (/[\p{C}\p{So}\p{Sk}]/u.test(ch) && !isWinAnsi(ch)) {
      continue;
    } else if (isWinAnsi(ch)) {
      out += ch;
    } else {
      const bare = ch.normalize("NFKD").replace(/\p{M}/gu, "");
      out += Array.from(bare).every(isWinAnsi) && bare.length > 0 ? bare : "?";
    }
  }
  return Array.from(out.replace(/ {2,}/g, " ").trim()).slice(0, max).join("");
}

/**
 * The stored snapshot, checked before drawing (it is jsonb, typed only by the ORM). Bounds are generous (shop
 * text has no column limit; the renderer cuts it to fit), so a real receipt never fails; malformed data does.
 */
const RECEIPT_DATA = z
  .object({
    shopName: z.string().min(1).max(300),
    address: z.string().max(600).nullable(),
    vatNumber: z.string().max(40).nullable(),
    requestedAt: z.iso.datetime({ offset: true }),
    approvedAt: z.iso.datetime({ offset: true }),
    items: z.array(z.string().max(80)).max(10),
    amountPence: z.number().int().min(1).max(10_000_000).nullable(),
    goldEarned: z.number().int().min(0).max(1_000_000),
    bonusGold: z.number().int().min(0).max(1_000_000),
    staffInitials: z.string().max(3),
  })
  .strict();

/** The snapshot if it is well formed, else null (the job logs the receipt id and finishes without retrying). */
export function parseReceiptData(data: unknown): ReceiptData | null {
  const parsed = RECEIPT_DATA.safeParse(data);
  return parsed.success ? parsed.data : null;
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const count = (n: number): string => n.toLocaleString("en-GB");

/** The label/value lines of a receipt, in order (pure; the PDF draws exactly these). */
export function receiptLines(number: number, data: ReceiptData): [string, string][] {
  const approved = new Date(data.approvedAt);
  const lines: [string, string][] = [
    ["Receipt no.", count(number)],
    ["Date", `${formatDate(approved)}, ${formatTime(approved)}`],
  ];
  const items = data.items
    .slice(0, MAX.items)
    .map((i) => pdfText(i, MAX.item))
    .filter(Boolean);
  if (items.length > 0) lines.push(["Items", items.join("\n")]);
  if (data.amountPence !== null) lines.push(["Amount", gbp.format(data.amountPence / 100)]);
  lines.push(["Gold earned", count(data.goldEarned)]);
  if (data.bonusGold > 0) {
    lines.push(["Streak bonus", count(data.bonusGold)]);
    lines.push(["Total gold", count(data.goldEarned + data.bonusGold)]);
  }
  const initials = pdfText(data.staffInitials, MAX.initials);
  if (initials) lines.push(["Approved by", initials]);
  return lines;
}

/** The header under the title: shop name, then its address and VAT number when the shop set them. */
export function receiptHeader(data: ReceiptData): string[] {
  const lines = [pdfText(data.shopName, MAX.shopName) || "Shop"];
  const address = data.address ? pdfText(data.address, MAX.address) : "";
  if (address) lines.push(address);
  const vat = data.vatNumber ? pdfText(data.vatNumber, MAX.vatNumber) : "";
  if (vat) lines.push(`VAT no. ${vat}`);
  return lines;
}

// Brand colours (DESIGN §3 tokens: --ink, --ink-2, --gold-deep, --line).
const INK = "#1a140a";
const INK_2 = "#5b4f3c";
const GOLD_DEEP = "#7c5510";
const LINE = "#e9dcbe";

/** Renders one receipt to PDF bytes (A5 portrait, one page). */
export async function renderReceiptPdf(number: number, data: ReceiptData): Promise<Buffer> {
  const approved = new Date(data.approvedAt);
  // Every option set explicitly (SECURITY §14). Left out on purpose: userPassword, ownerPassword and
  // permissions (no encryption: the route authorises the download) and subset (no PDF/A claim).
  const doc = new PDFDocument({
    size: "A5",
    layout: "portrait",
    margin: 40,
    pdfVersion: "1.7",
    compress: true,
    autoFirstPage: true,
    bufferPages: false,
    displayTitle: true,
    lang: "en-GB",
    tagged: false,
    info: {
      Title: RECEIPT_TITLE,
      Producer: "Moz Rewards",
      Creator: "Moz Rewards",
      CreationDate: approved,
      ModDate: approved,
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(GOLD_DEEP).text("MOZ REWARDS", { width });
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text(RECEIPT_TITLE, { width });
  doc.moveDown(0.6);
  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .lineWidth(2)
    .strokeColor(GOLD_DEEP)
    .stroke();
  doc.moveDown(1);

  const [shopName, ...details] = receiptHeader(data);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(INK)
    .text(shopName ?? "Shop", { width });
  for (const line of details)
    doc.font("Helvetica").fontSize(9).fillColor(INK_2).text(line, { width });
  doc.moveDown(1.2);

  const labelWidth = 100;
  for (const [label, value] of receiptLines(number, data)) {
    const top = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(INK_2).text(label, left, top, {
      width: labelWidth,
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(INK)
      .text(value, left + labelWidth, top, { width: width - labelWidth });
    const bottom = Math.max(doc.y, top + 14);
    doc
      .moveTo(left, bottom + 4)
      .lineTo(left + width, bottom + 4)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke();
    doc.y = bottom + 10;
  }

  doc.moveDown(1);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(INK_2)
    .text(
      "A record of the gold you earned. It is not a VAT invoice or proof of payment.",
      left,
      doc.y,
      {
        width,
      },
    );

  doc.end();
  return done;
}
