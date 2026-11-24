import { expect, type Page, test } from "@playwright/test";
import { diffRatio } from "./support/diff";
import {
  fireTimed,
  freezeTimed,
  openForMotion,
  referenceUrl,
  reseed,
  type Sample,
} from "./support/motion";
import { attachPair, capture } from "./support/reference";
import { PARITY_PARTS, parityLimit } from "../../src/features/dev/molten/parity-parts";

/**
 * Gilded Gate 2.0 parity (PD-09): the reference intro against the app's (`/dev/molten`, the real gate's scene),
 * replayed on both under the paused page clock with the same seeded `Math.random`, so both draw the same
 * particles on the same frames. Frames at the beats (700 / 1150 / 1450 / 2300 ms) and at rest (≤ 2% of pixels),
 * the particle canvas itself during convergence (≤ 5% of its lit 4 px cells);
 * curves of the coin, the orbit rings and every letter every 50 ms (2 px, 0.03).
 */
const VP = { width: 390, height: 844 };
const STOPS = [700, 1150, 1450, 2300] as const;
const REST_MS = 4000;
const MAX_DIFF = 0.02;
/** Lit canvas cells that may differ (same seed, same frames: none should). */
const PARTICLES_MAX = 0.05;
const STEP_MS = 50;
const CURVE_MS = 3000;
const PX = 2;
const UNIT = 0.03;
/** Replay: the button after Slow-mo (both pages). */
const REPLAY = "[aria-pressed] + button";
/** What the curves follow, in document order on each page (orbit rings, coin, letters). */
const MOVERS = {
  ref: ".orbits, .logo, .ch",
  app: ".gate-orbits, .gate-coin, .gate-ch",
} as const;

const part = PARITY_PARTS.find((p) => p.name === "intro");

async function replay(page: Page): Promise<void> {
  await capture(page, "intro"); // scrolled into view the same way on both
  await reseed(page);
  await fireTimed(page, "intro", REPLAY);
}

/** The night canvas as a coarse grid (4 px cells, mean brightness): where the particles are, comparable. */
async function canvasGrid(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>('[data-parity="intro"] canvas');
    const g = cv?.getContext("2d");
    if (!cv || !g) return [];
    const { data } = g.getImageData(0, 0, cv.width, cv.height);
    const out: number[] = [];
    for (let y = 0; y + 4 <= cv.height; y += 4)
      for (let x = 0; x + 4 <= cv.width; x += 4) {
        let sum = 0;
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            const k = ((y + j) * cv.width + x + i) * 4;
            sum += (data[k] ?? 0) + (data[k + 1] ?? 0) + (data[k + 2] ?? 0);
          }
        out.push(sum / 48);
      }
    return out;
  });
}

/** Share of the lit cells (either side) whose brightness differs clearly: 0 for the same particles. */
function gridDiff(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 1;
  let lit = 0;
  let off = 0;
  a.forEach((v, i) => {
    const w = b[i] ?? 0;
    if (Math.max(v, w) < 40) return;
    lit++;
    if (Math.abs(v - w) > 24) off++;
  });
  return lit === 0 ? 1 : off / lit;
}

async function sample(page: Page, selector: string): Promise<Sample[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector('[data-parity="intro"]');
    return [...(root?.querySelectorAll(sel) ?? [])].map((el) => {
      const cs = getComputedStyle(el);
      const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
      return { x: m.e, y: m.f, scale: Math.hypot(m.a, m.b), opacity: Number(cs.opacity) };
    });
  }, selector);
}

test.describe("[PD-09] Gilded Gate intro parity", () => {
  // Two pages driven through 4 s of canvas frames: ~33 s alone on laptop Linux WebKit, past 90 s beside three
  // other parity workers (gate 24 Nov; KI-10).
  test.describe.configure({ timeout: 180_000 });

  test("[PD-09] the intro's beats and rest frame match the reference", async ({
    page,
    context,
  }) => {
    if (!part) throw new Error("intro part missing");
    const ref = await context.newPage();
    await openForMotion(ref, referenceUrl, VP.width, VP.height);
    await openForMotion(page, "/dev/molten", VP.width, VP.height);
    const max = parityLimit(part, page.context().browser()?.browserType().name() ?? "", MAX_DIFF);
    await replay(ref);
    await replay(page);
    let at = 0;
    for (const ms of [...STOPS, REST_MS]) {
      await ref.clock.runFor(ms - at);
      await page.clock.runFor(ms - at);
      at = ms;
      const rest = ms === REST_MS;
      await freezeTimed(ref, rest);
      await freezeTimed(page, rest);
      // Sparse particles are under 2% of the stage's pixels, so the canvases are compared on their own too.
      if (ms < 1250) {
        const g = gridDiff(await canvasGrid(ref), await canvasGrid(page));
        expect(g, `particles at ${String(ms)} ms`).toBeLessThanOrEqual(PARTICLES_MAX);
      }
      const a = await capture(ref, "intro");
      const b = await capture(page, "intro");
      const name = rest ? "rest" : `${String(ms)}ms`;
      const d = diffRatio(a, b);
      if (d.ratio > max) await attachPair(`intro-${name}`, a, b);
      expect(d.ratio, `intro at ${name}: ${d.why ?? ""}`).toBeLessThanOrEqual(max);
    }
  });

  test("[PD-09] the coin, the orbit rings and the letters move like the reference", async ({
    page,
    context,
  }) => {
    const ref = await context.newPage();
    await openForMotion(ref, referenceUrl, VP.width, VP.height);
    await openForMotion(page, "/dev/molten", VP.width, VP.height);
    await replay(ref);
    await replay(page);
    let px = 0;
    let unit = 0;
    let worst = "";
    for (let t = 0; t <= CURVE_MS; t += STEP_MS) {
      if (t > 0) {
        await ref.clock.runFor(STEP_MS);
        await page.clock.runFor(STEP_MS);
      }
      await freezeTimed(ref);
      await freezeTimed(page);
      const a = await sample(ref, MOVERS.ref);
      const b = await sample(page, MOVERS.app);
      expect(b.length, `elements at ${String(t)} ms`).toBe(a.length);
      a.forEach((s, j) => {
        const o = b[j];
        if (!o) return;
        const dp = Math.max(Math.abs(s.x - o.x), Math.abs(s.y - o.y));
        const du = Math.max(Math.abs(s.scale - o.scale), Math.abs(s.opacity - o.opacity));
        if (dp > px || du > unit) worst = `t=${String(t)} ms, element ${String(j)}`;
        px = Math.max(px, dp);
        unit = Math.max(unit, du);
      });
    }
    expect(px, `translate: ${worst}`).toBeLessThanOrEqual(PX);
    expect(unit, `scale/opacity: ${worst}`).toBeLessThanOrEqual(UNIT);
  });
});
