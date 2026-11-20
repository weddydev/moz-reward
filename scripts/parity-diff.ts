/**
 * `pnpm exec tsx scripts/parity-diff.ts <ref.png> <app.png> <out.png>` (PD-02, debugging aid): writes a map of
 * the pixels that differ (red over a faded reference), with the same threshold as the parity specs, and prints
 * the bounding boxes of the differing regions in a coarse grid, so a mismatch can be located before fixing it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const [refPath, appPath, outPath] = process.argv.slice(2);
if (!refPath || !appPath || !outPath)
  throw new Error("usage: parity-diff <ref.png> <app.png> <out.png>");
const a = PNG.sync.read(readFileSync(refPath));
const b = PNG.sync.read(readFileSync(appPath));
const w = Math.min(a.width, b.width);
const h = Math.min(a.height, b.height);
const out = new PNG({ width: w, height: h });
const CELL = 64;
const cells = new Map<string, number>();
for (let y = 0; y < h; y += 1) {
  for (let x = 0; x < w; x += 1) {
    const ia = (y * a.width + x) * 4;
    const ib = (y * b.width + x) * 4;
    const io = (y * w + x) * 4;
    let differ = false;
    for (let c = 0; c < 4; c += 1)
      if (Math.abs((a.data[ia + c] ?? 0) - (b.data[ib + c] ?? 0)) > 26) differ = true;
    if (differ) {
      out.data[io] = 255;
      out.data[io + 1] = 0;
      out.data[io + 2] = 0;
      out.data[io + 3] = 255;
      const key = `${String(Math.floor(x / CELL))},${String(Math.floor(y / CELL))}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    } else {
      const g = Math.round(((a.data[ia] ?? 0) + (a.data[ia + 1] ?? 0) + (a.data[ia + 2] ?? 0)) / 3);
      out.data[io] = out.data[io + 1] = out.data[io + 2] = Math.round(g * 0.35 + 165);
      out.data[io + 3] = 255;
    }
  }
}
writeFileSync(outPath, PNG.sync.write(out));
const top = [...cells.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12);
process.stdout.write(
  `size ref ${String(a.width)}×${String(a.height)} app ${String(b.width)}×${String(b.height)}\n` +
    top.map(([k, n]) => `cell ${k} (x,y ×${String(CELL)} px): ${String(n)} px`).join("\n") +
    "\n",
);
