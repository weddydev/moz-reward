import { type CDPSession, type Page, type TestInfo } from "@playwright/test";

/**
 * CPU throttling that means the same thing on every machine (DECISIONS 20 Nov).
 *
 * `Emulation.setCPUThrottlingRate` slows the host's own CPU by a factor, so "4×" on a slow laptop is a much
 * slower device than "4×" on the CI runner: the 60 fps and long-task specs failed about half the time on the
 * Windows laptop (clean main too) and passed on Linux CI and the Mac. The specs are written for the CI runner
 * at 4× (the reference device: a runner scoring `CI_CPU_SCORE`), so on every machine, CI included, a fixed
 * in-browser benchmark is timed before throttling and the rate is scaled by host score / reference score,
 * clamped to [1, 20], so every machine runs at the reference's effective speed. CI is calibrated too since
 * 21 Nov: GitHub's ubuntu runners score ~46,000 to ~77,000, and a fixed 4× on a slow one failed the fx
 * stress (53–55 fps) that the same commit passed on a fast one (DECISIONS 21 Nov).
 * The score and the rate used are attached to the test (and logged), so a run always shows what it measured.
 */

/**
 * Benchmark score of the reference device's host (a fast ubuntu-latest runner, Chromium, Playwright 1.65), from
 * the `[cpu]` lines of CI's `@perf` step (alone, one worker). Re-measure if the benchmark below changes.
 */
// CI's score where the throttled specs run now: alone, one worker (`@perf` step, process audit 21 Nov). Run
// 44925792127: 62,987–77,533 over 10 throttled tests, median ≈ 72,000. The old 28,000 (run 44723422284) was measured
// with the full suite on 2 workers beside it, so a laptop then ran these specs ~2.5× harder than CI (DECISIONS 21 Nov).
export const CI_CPU_SCORE = 70_000;

/** Iterations per second of a mixed string/array workload (higher = faster CPU); median of 5 runs. */
async function benchmark(page: Page): Promise<number> {
  return page.evaluate(() => {
    const once = (): number => {
      const a = Array.from({ length: 20_000 }, (_, i) => (i * 7919) % 20_000);
      const start = performance.now();
      let iterations = 0;
      while (performance.now() - start < 150) {
        let s = "";
        for (let j = 0; j < 2_000; j += 1) s += "a";
        const b = a.slice();
        for (let j = 0; j < b.length; j += 1) b[j] = (b[j] ?? 0) ^ s.length;
        iterations += 1;
      }
      return (iterations * 1000) / (performance.now() - start);
    };
    const runs = Array.from({ length: 5 }, once).sort((x, y) => x - y);
    return runs[2] ?? 0;
  });
}

/** The CDP rate that makes a host scoring `score` run like the reference device at `nominal`×, within [1, 20]. */
export function throttleRate(nominal: number, score: number): number {
  return Math.min(20, Math.max(1, (nominal * score) / CI_CPU_SCORE));
}

/**
 * Whether a host scoring `score` can play the reference device at `nominal`× at all: only if it is at least as
 * fast unthrottled (rate ≥ 1). A slower host (the Windows laptop under load: 8,780 = 0.5×) would measure itself,
 * not the code, so it gives no verdict there; CI always does (DECISIONS 22 Nov).
 */
export function canEmulate(nominal: number, score: number): boolean {
  return (nominal * score) / CI_CPU_SCORE >= 1;
}

/**
 * Throttles `page`'s CPU to `nominal`× of the reference runner; returns the CDP session and the rate used. On a
 * host too slow to emulate the reference the test is skipped with the score as the reason, except on CI, where
 * it fails: CI's verdict is the one main relies on, so it can never be skipped there.
 */
export async function throttleCpu(
  page: Page,
  testInfo: TestInfo,
  nominal = 4,
): Promise<{ cdp: CDPSession; rate: number }> {
  // Measured in a page of its own, so the benchmark's garbage never lands in the measured page's heap.
  const probe = await page.context().newPage();
  const score = await benchmark(probe);
  await probe.close();
  if (!canEmulate(nominal, score)) {
    const why = `host CPU score ${score.toFixed(0)} is below the reference device (${String(CI_CPU_SCORE / nominal)} for ${String(nominal)}× of CI ${String(CI_CPU_SCORE)}): no verdict here, CI measures it`;
    console.warn(`[cpu] ${why}`);
    if (process.env.CI) throw new Error(why);
    testInfo.skip(true, why);
  }
  const cdp = await page.context().newCDPSession(page);
  const rate = throttleRate(nominal, score);
  const description = `score ${score.toFixed(0)} (CI ${String(CI_CPU_SCORE)}), rate ${rate.toFixed(2)}× for nominal ${String(nominal)}×`;
  testInfo.annotations.push({ type: "cpu throttle", description });
  console.warn(`[cpu] ${description}`); // in the run log, so CI reports its own score
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  return { cdp, rate };
}
