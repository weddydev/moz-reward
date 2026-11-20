import { PNG } from "pngjs";

/**
 * Share of pixels that differ between two PNG screenshots (0–1). A pixel differs when any channel moves by
 * more than `threshold` (0–255; 26 ≈ 10%, close to pixelmatch's default), which ignores sub-pixel anti-aliasing
 * noise but not a moved edge. Different sizes are a full mismatch (1) — a layout difference, not noise.
 */
export function diffRatio(a: Buffer, b: Buffer, threshold = 26): { ratio: number; why?: string } {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) {
    return {
      ratio: 1,
      why: `size ${String(pa.width)}×${String(pa.height)} vs ${String(pb.width)}×${String(pb.height)}`,
    };
  }
  let differ = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    for (let c = 0; c < 4; c += 1) {
      if (Math.abs((pa.data[i + c] ?? 0) - (pb.data[i + c] ?? 0)) > threshold) {
        differ += 1;
        break;
      }
    }
  }
  return { ratio: differ / (pa.width * pa.height) };
}
