import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { qrPath } from "./qr-path";

describe("[P1-14] member QR drawing", () => {
  it("[P1-14] draws exactly the dark modules of the encoded text", () => {
    const text = "MQ1.AbCdEf0123456789-_AbCdEf0123456789-_AbCdEf0123456789-_ab";
    const { size, d } = qrPath(text);
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
    expect(size).toBe(modules.size);
    const drawn = new Set([...d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => `${m[1]},${m[2]}`));
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const on = Boolean(modules.get(y, x));
        if (on) dark++;
        expect(drawn.has(`${x},${y}`)).toBe(on);
      }
    }
    expect(drawn.size).toBe(dark);
  });
});
