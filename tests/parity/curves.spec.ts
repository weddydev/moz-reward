import { expect, type Page, test } from "@playwright/test";
import {
  openForMotion,
  referenceUrl,
  type Sample,
  sampleCurves,
  seekMs,
  fire,
  TRIGGERS,
} from "./support/motion";
import { capture } from "./support/reference";
import { PARITY_PARTS } from "../../src/features/dev/molten/parity-parts";

/**
 * Curve parity (PD-01): during each interaction, translate / scale / opacity of the part's elements are sampled
 * every 50 ms of animation time on both pages; max deviation 2 px (translate) and 0.03 (scale, opacity).
 * Elements are compared in document order, so a part's markup must keep the reference's element structure for
 * what moves (each task notes any deliberate difference in DECISIONS with a tolerance).
 */
const STEP_MS = 50;
const PX = 2;
const UNIT = 0.03;
const VP = { width: 390, height: 844 };

async function curve(page: Page, part: string): Promise<Sample[][]> {
  await capture(page, part); // scrolls it into view the same way on both pages
  const el = page.locator(`[data-parity="${part}"]`).first();
  await fire(page, part);
  const longest = await seekMs(page, part, 0);
  const out: Sample[][] = [];
  for (let t = 0; t <= longest; t += STEP_MS) {
    await seekMs(page, part, t);
    out.push(await sampleCurves(el));
  }
  return out;
}

/** Largest deviation between two sampled curves, with where it happened. */
function deviation(a: Sample[][], b: Sample[][]): { px: number; unit: number; at: string } {
  let px = 0;
  let unit = 0;
  let at = "";
  if (a.length !== b.length)
    return {
      px: Infinity,
      unit: Infinity,
      at: `${String(a.length)} vs ${String(b.length)} samples`,
    };
  a.forEach((frame, i) => {
    const other = b[i] ?? [];
    if (frame.length !== other.length) {
      px = Infinity;
      at = `sample ${String(i)}: ${String(frame.length)} vs ${String(other.length)} elements`;
      return;
    }
    frame.forEach((s, j) => {
      const o = other[j];
      if (!o) return;
      const dp = Math.max(Math.abs(s.x - o.x), Math.abs(s.y - o.y));
      const du = Math.max(Math.abs(s.scale - o.scale), Math.abs(s.opacity - o.opacity));
      if (dp > px || du > unit) at = `t=${String(i * STEP_MS)} ms, element ${String(j)}`;
      px = Math.max(px, dp);
      unit = Math.max(unit, du);
    });
  });
  return { px, unit, at };
}

test.describe("[PD-01] curve parity", () => {
  test("[PD-01] self-test: the reference against itself deviates by 0", async ({
    page,
    context,
  }) => {
    const other = await context.newPage();
    await openForMotion(page, referenceUrl, VP.width, VP.height);
    await openForMotion(other, referenceUrl, VP.width, VP.height);
    for (const part of ["heart-toggle", "coin-switch", "tabs"]) {
      const a = await curve(page, part);
      expect(a.length, `${part} has samples`).toBeGreaterThan(1);
      const d = deviation(a, await curve(other, part));
      expect([d.px, d.unit], `${part}: ${d.at}`).toEqual([0, 0]);
    }
  });

  for (const part of PARITY_PARTS.filter((p) => p.status === "required" && p.name in TRIGGERS)) {
    test(`[${part.task}] ${part.title} follows the reference's curves`, async ({
      page,
      context,
    }) => {
      const ref = await context.newPage();
      await openForMotion(ref, referenceUrl, VP.width, VP.height);
      await openForMotion(page, "/dev/molten", VP.width, VP.height);
      const d = deviation(await curve(ref, part.name), await curve(page, part.name));
      expect(d.px, d.at).toBeLessThanOrEqual(PX);
      expect(d.unit, d.at).toBeLessThanOrEqual(UNIT);
    });
  }
});
