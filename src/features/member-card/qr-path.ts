import QRCode from "qrcode";

/**
 * A QR code as one SVG path (P1-14): one `h1v1h-1z` square per dark module, in module units, so the SVG scales
 * crisply to any size with `shape-rendering: crispEdges`. Error correction M: the member card shows the code on a
 * phone screen, where glare and a small size matter more than damage.
 */
export function qrPath(text: string): { size: number; d: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const parts: string[] = [];
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.get(y, x)) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return { size: modules.size, d: parts.join("") };
}
