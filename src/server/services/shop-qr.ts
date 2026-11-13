import "server-only";
import QRCode from "qrcode";
import { normaliseCode, SHOP_CODE_LENGTH } from "@/lib/codes";
import { env } from "@/server/env";

/**
 * Shop entry links and their QR codes (P1-01, PRODUCT §3): `https://<APP_URL>/s/<code>?src=qr|nfc|code`.
 * QR: error correction M (survives a scuffed sticker without growing the code), quiet zone 4 modules (the
 * ISO 18004 minimum). NFC tags carry the same URL with `src=nfc` as a plain NDEF URL record. Print kits
 * (P2-06) embed the SVG; the PNG is for sharing and the decode test.
 */
export type EntrySource = "qr" | "nfc" | "code";

const QR_OPTIONS = { errorCorrectionLevel: "M", margin: 4 } as const;
const PNG_SCALE = 12;

export function shopEntryUrl(code: string, src: EntrySource, appUrl = env().APP_URL): string {
  const shopCode = normaliseCode(code, SHOP_CODE_LENGTH);
  if (!shopCode) throw new RangeError("not a valid shop code");
  const url = new URL(`/s/${shopCode}`, appUrl);
  url.searchParams.set("src", src);
  return url.toString();
}

export function shopQrSvg(code: string, src: EntrySource, appUrl?: string): Promise<string> {
  return QRCode.toString(shopEntryUrl(code, src, appUrl), { ...QR_OPTIONS, type: "svg" });
}

export function shopQrPng(code: string, src: EntrySource, appUrl?: string): Promise<Buffer> {
  return QRCode.toBuffer(shopEntryUrl(code, src, appUrl), {
    ...QR_OPTIONS,
    type: "png",
    scale: PNG_SCALE,
  });
}
