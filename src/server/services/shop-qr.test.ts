import jsQR from "jsqr";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { shopEntryUrl, shopQrPng, shopQrSvg } from "./shop-qr";

const APP = "https://staging.mozrewards.com";

function decodePng(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data ?? null;
}

describe("[P1-01] shop QR and NFC URLs", () => {
  it("builds /s/<code>?src=… on APP_URL, normalising the code", () => {
    expect(shopEntryUrl("k7q-42m", "qr", APP)).toBe(`${APP}/s/K7Q42M?src=qr`);
    expect(shopEntryUrl("K7Q42M", "nfc", APP)).toBe(`${APP}/s/K7Q42M?src=nfc`);
    expect(shopEntryUrl("K7Q42M", "code", `${APP}/`)).toBe(`${APP}/s/K7Q42M?src=code`);
  });

  it("refuses a code that can't exist", () => {
    expect(() => shopEntryUrl("K7Q4OM", "qr", APP)).toThrow(/shop code/);
  });

  it("the PNG decodes to the exact URL", async () => {
    for (const src of ["qr", "nfc"] as const) {
      const png = await shopQrPng("K7Q42M", src, APP);
      expect(decodePng(png)).toBe(`${APP}/s/K7Q42M?src=${src}`);
    }
  });

  it("uses error correction M and a 4-module quiet zone, in the PNG and the SVG", async () => {
    const url = shopEntryUrl("K7Q42M", "qr", APP);
    const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
    const side = modules.size + 8;

    const svg = await shopQrSvg("K7Q42M", "qr", APP);
    const as = (level: "M" | "H") =>
      QRCode.toString(url, { type: "svg", errorCorrectionLevel: level, margin: 4 });
    expect(svg).toBe(await as("M"));
    expect(svg).not.toBe(await as("H"));
    expect(svg).toMatch(new RegExp(`viewBox="0 0 ${String(side)} ${String(side)}"`));
    expect(svg).not.toMatch(/<script|on\w+=/i);

    const png = PNG.sync.read(await shopQrPng("K7Q42M", "qr", APP));
    const scale = png.width / side;
    expect(Number.isInteger(scale)).toBe(true);
    // The quiet zone is white all round: the first 4 modules of the top row.
    for (let x = 0; x < 4 * scale; x++) expect(png.data[x * 4]).toBe(255);
    // The finder pattern starts dark right after it.
    expect(png.data[(4 * scale * png.width + 4 * scale) * 4]).toBe(0);
  });
});
