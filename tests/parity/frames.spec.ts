import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { diffRatio } from "./support/diff";
import { fire, openForMotion, referenceUrl, seekFraction, TRIGGERS } from "./support/motion";
import { capture, edgeCycleAt, freezeAt, openStill, REFERENCE_PATH } from "./support/reference";
import { PARITY_PARTS, parityLimit } from "../../src/features/dev/molten/parity-parts";

/**
 * Frame parity (PD-01): each moving part is triggered on both pages and captured paused at 0, 25, 50, 75 and
 * 100% of its animations; ≤ 2% of pixels may differ per frame. Named beats of signature moments are added by
 * their tasks (PD-09, PD-10).
 */
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
const MAX_DIFF = 0.02;

/** The fractions captured for `part`: the standard five plus its named beats, in order. */
const fractionsOf = (part: string): number[] =>
  [...new Set([...FRACTIONS, ...(TRIGGERS[part]?.beats ?? [])])].sort((x, y) => x - y);
const VP = { width: 390, height: 844 };

/** What each captured frame of `part` is called: ms after the trigger (`atMs`) or a fraction. */
const stopsOf = (part: string): string[] =>
  TRIGGERS[part]?.atMs?.map((ms) => `${String(ms)}ms`) ?? fractionsOf(part).map(String);

async function frames(page: Page, part: string): Promise<Buffer[]> {
  // Scrolls it into view the same way on both pages; a part that appears only when triggered (the toast) is
  // fixed on screen and has nothing to scroll to yet.
  if (!TRIGGERS[part]?.waitFor) await capture(page, part);
  await fire(page, part);
  const out: Buffer[] = [];
  const atMs = TRIGGERS[part]?.atMs;
  if (atMs) {
    for (const ms of atMs) {
      await freezeAt(page, ms);
      out.push(await capture(page, part));
    }
    return out;
  }
  for (const f of fractionsOf(part)) {
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

/** Gilded edge beats (PD-02): the gem glint at its peak (3% of the 8 s cycle) and the light glide (12%). */
const EDGE_BEATS = [0.03 * 8000, 0.12 * 8000] as const;

test.describe("[PD-02] gilded edge frames", () => {
  test("[PD-02] the gem glint (3%) and the glide (12%) match the reference on the Language section", async ({
    page,
    context,
  }) => {
    // No page clock here: the beats are seeked directly, and /dev/molten streams its content in with timers.
    const ref = await context.newPage();
    await openStill(ref, REFERENCE_PATH, 1440, 900);
    await openStill(page, "/dev/molten", 1440, 900);
    for (const ms of EDGE_BEATS) {
      await edgeCycleAt(ref, ms);
      await edgeCycleAt(page, ms);
      const a = await capture(ref, "language");
      const b = await capture(page, "language");
      const d = diffRatio(a, b);
      if (d.ratio > MAX_DIFF) await attachPair(`edge-${String(ms)}`, a, b);
      expect(d.ratio, `edge at ${String(ms)} ms: ${d.why ?? ""}`).toBeLessThanOrEqual(MAX_DIFF);
    }
  });
});

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
        const at = String(fractionsOf(part)[i]);
        if (d.ratio > 0) await attachPair(`${part}-${at}`, shot, b[i]);
        expect(d.ratio, `${part} at ${at}: ${d.why ?? ""}`).toBe(0);
      }
    }
  });

  for (const part of PARITY_PARTS.filter((p) => p.status === "required" && p.name in TRIGGERS)) {
    test(`[${part.task}] ${part.title} moves like the reference`, async ({ page, context }) => {
      const ref = await context.newPage();
      await openForMotion(ref, referenceUrl, VP.width, VP.height);
      await openForMotion(page, "/dev/molten", VP.width, VP.height);
      const max = parityLimit(part, page.context().browser()?.browserType().name() ?? "", MAX_DIFF);
      const a = await frames(ref, part.name);
      const b = await frames(page, part.name);
      const at = stopsOf(part.name);
      for (const [i, shot] of a.entries()) {
        const d = diffRatio(shot, b[i] ?? Buffer.alloc(0));
        if (d.ratio > max) await attachPair(`${part.name}-${at[i] ?? ""}`, shot, b[i]);
        expect(d.ratio, `${part.name} at ${at[i] ?? ""}: ${d.why ?? ""}`).toBeLessThanOrEqual(max);
      }
    });
  }
});
