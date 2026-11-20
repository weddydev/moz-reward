import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { diffRatio } from "./support/diff";
import { fire, openForMotion, referenceUrl, seekFraction, TRIGGERS } from "./support/motion";
import { capture } from "./support/reference";
import { PARITY_PARTS } from "../../src/features/dev/molten/parity-parts";

/**
 * Frame parity (PD-01): each moving part is triggered on both pages and captured paused at 0, 25, 50, 75 and
 * 100% of its animations; ≤ 2% of pixels may differ per frame. Named beats of signature moments are added by
 * their tasks (PD-09, PD-10).
 */
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
const MAX_DIFF = 0.02;
const VP = { width: 390, height: 844 };

async function frames(page: Page, part: string): Promise<Buffer[]> {
  await capture(page, part); // scrolls it into view the same way on both pages
  await fire(page, part);
  const out: Buffer[] = [];
  for (const f of FRACTIONS) {
    await seekFraction(page, f);
    out.push(await capture(page, part));
  }
  return out;
}

/** On a mismatch, both frames go into the report (and test-results) for inspection. */
async function attachPair(name: string, a: Buffer, b: Buffer | undefined): Promise<void> {
  const info = test.info();
  for (const [side, img] of [
    ["a", a],
    ["b", b],
  ] as const) {
    if (!img) continue;
    const file = info.outputPath(`${name}-${side}.png`);
    writeFileSync(file, img);
    await info.attach(`${name}-${side}.png`, { path: file, contentType: "image/png" });
  }
}

test.describe("[PD-01] frame parity", () => {
  test("[PD-01] self-test: the reference against itself is 0 at every captured frame", async ({
    page,
    context,
  }) => {
    const other = await context.newPage();
    await openForMotion(page, referenceUrl, VP.width, VP.height);
    await openForMotion(other, referenceUrl, VP.width, VP.height);
    for (const part of ["heart-toggle", "coin-switch", "tabs"]) {
      const a = await frames(page, part);
      const b = await frames(other, part);
      for (const [i, shot] of a.entries()) {
        const d = diffRatio(shot, b[i] ?? Buffer.alloc(0));
        if (d.ratio > 0) await attachPair(`${part}-${String(FRACTIONS[i])}`, shot, b[i]);
        expect(d.ratio, `${part} at ${String(FRACTIONS[i])}: ${d.why ?? ""}`).toBe(0);
      }
    }
  });

  for (const part of PARITY_PARTS.filter((p) => p.status === "required" && p.name in TRIGGERS)) {
    test(`[${part.task}] ${part.title} moves like the reference`, async ({ page, context }) => {
      const ref = await context.newPage();
      await openForMotion(ref, referenceUrl, VP.width, VP.height);
      await openForMotion(page, "/dev/molten", VP.width, VP.height);
      const a = await frames(ref, part.name);
      const b = await frames(page, part.name);
      a.forEach((shot, i) => {
        const d = diffRatio(shot, b[i] ?? Buffer.alloc(0));
        expect(
          d.ratio,
          `${part.name} at ${String(FRACTIONS[i])}: ${d.why ?? ""}`,
        ).toBeLessThanOrEqual(MAX_DIFF);
      });
    });
  }
});
