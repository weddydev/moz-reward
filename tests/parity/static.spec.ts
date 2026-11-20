import { expect, type Page, test } from "@playwright/test";
import { diffRatio } from "./support/diff";
import {
  attachPair,
  capture,
  edgesDrawn,
  freezeAt,
  instantScroll,
  REFERENCE_PATH,
  seedRandom,
  offline,
  serveReference,
} from "./support/reference";
import { PARITY_PARTS } from "../../src/features/dev/molten/parity-parts";

/**
 * Static parity (PD-01): every `data-parity` part at rest, animations paused, FX canvas hidden; `/dev/molten`
 * against the reference, same browser and OS, page to page (no baselines). ≤ 1% of pixels may differ.
 */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const MAX_DIFF = 0.01;

async function open(page: Page, url: string, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await seedRandom(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(url);
  await instantScroll(page);
  await page.evaluate(() => document.fonts.ready);
  await edgesDrawn(page);
}

async function shot(page: Page, part: string): Promise<Buffer> {
  await freezeAt(page, "rest");
  return capture(page, part);
}

const required = PARITY_PARTS.filter((p) => p.status === "required");
const pending = PARITY_PARTS.filter((p) => p.status === "pending");

test.describe("[PD-01] static parity", () => {
  test.beforeEach(async ({ page }) => {
    await serveReference(page);
  });

  test("[PD-01] pending parts are listed (each PD task makes its own parts required)", () => {
    test.info().annotations.push({
      type: "pending parts",
      description: pending.map((p) => `${p.name} (${p.task})`).join(", "),
    });
    expect(required.length + pending.length).toBe(PARITY_PARTS.length);
  });

  for (const vp of VIEWPORTS) {
    test(`[PD-01] self-test at ${String(vp.width)}: the reference against itself is 0, a 3 px offset fails`, async ({
      page,
      context,
    }) => {
      const other = await context.newPage();
      await serveReference(other);
      await open(page, REFERENCE_PATH, vp.width, vp.height);
      await open(other, REFERENCE_PATH, vp.width, vp.height);
      // Offline: the reference copy and its fonts come from this machine only.
      expect(offline.get(page)).toEqual([]);
      expect(offline.get(other)).toEqual([]);
      for (const part of ["heart-toggle", "molten-button", "tabs"]) {
        const same = diffRatio(await shot(page, part), await shot(other, part));
        expect(same.ratio, `${part}: ${same.why ?? ""}`).toBe(0);
      }
      await other.addStyleTag({ content: '[data-parity="heart-toggle"] > *{translate:3px 0}' });
      const moved = diffRatio(await shot(page, "heart-toggle"), await shot(other, "heart-toggle"));
      expect(moved.ratio).toBeGreaterThan(MAX_DIFF);
    });

    for (const part of required) {
      test(`[${part.task}] ${part.title} matches the reference at ${String(vp.width)}`, async ({
        page,
        context,
      }) => {
        const ref = await context.newPage();
        await serveReference(ref);
        await open(ref, REFERENCE_PATH, vp.width, vp.height);
        await open(page, "/dev/molten", vp.width, vp.height);
        const a = await shot(ref, part.name);
        const b = await shot(page, part.name);
        const d = diffRatio(a, b);
        if (d.ratio > MAX_DIFF) await attachPair(`${part.name}-${String(vp.width)}`, a, b);
        expect(d.ratio, d.why).toBeLessThanOrEqual(MAX_DIFF);
      });
    }
  }
});
