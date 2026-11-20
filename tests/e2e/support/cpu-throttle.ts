import { type CDPSession, type Page, type TestInfo } from "@playwright/test";

/**
 * CPU throttling that means the same thing on every machine (DECISIONS 20 Nov).
 *
 * `Emulation.setCPUThrottlingRate` slows the host's own CPU by a factor, so "4×" on a slow laptop is a much
 * slower device than "4×" on the CI runner: the 60 fps and long-task specs failed about half the time on the
 * Windows laptop (clean main too) and passed on Linux CI and the Mac. The specs are written for the CI runner
 * at 4× (the reference device), so:
 * - on CI the rate is exactly the nominal one (CI *is* the reference; nothing changes there);
 * - elsewhere a fixed in-browser benchmark is timed before throttling and the rate is scaled by
 *   host score / CI score, clamped to [1, 20], so every machine runs at the reference's effective speed.
 * The score and the rate used are attached to the test (and logged), so a run always shows what it measured.
 */

/**
 * Benchmark score of the CI runner's Chromium (ubuntu-latest, Playwright 1.65), from the `[cpu]` line of the
 * Linux 5-project run. Re-measure if GitHub changes the runner hardware or the benchmark below changes.
 */
export const CI_CPU_SCORE: number = 0; // set from the first Linux run (0 = not measured yet: nominal rate)

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

/** Throttles `page`'s CPU to `nominal`× of the reference runner; returns the CDP session and the rate used. */
export async function throttleCpu(
  page: Page,
  testInfo: TestInfo,
  nominal = 4,
): Promise<{ cdp: CDPSession; rate: number }> {
  const cdp = await page.context().newCDPSession(page);
  const score = await benchmark(page);
  const rate =
    process.env.CI || CI_CPU_SCORE <= 0
      ? nominal
      : Math.min(20, Math.max(1, (nominal * score) / CI_CPU_SCORE));
  const description = `score ${score.toFixed(0)} (CI ${String(CI_CPU_SCORE)}), rate ${rate.toFixed(2)}× for nominal ${String(nominal)}×`;
  testInfo.annotations.push({ type: "cpu throttle", description });
  console.warn(`[cpu] ${description}`); // in the run log, so CI reports its own score
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  return { cdp, rate };
}
