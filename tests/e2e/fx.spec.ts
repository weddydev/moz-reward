import { type Page } from "@playwright/test";
import { throttleCpu } from "./support/cpu-throttle";
import { expect, test } from "./support/test";

/**
 * PD-03 on the production build: the shared FX canvas (root layout), the effect tier, reduced motion and the
 * press kit, driven through the /dev/motion playground (`window.__mozFx`). Physics parity is unit-tested
 * (fx.test.ts) and asserted against the reference by the spec table (molten-spec.test.ts, row fx-engine).
 */
type Stats = { mounted: boolean; live: number; running: boolean; frames: number; cap: number };
type Hook = {
  burst: (x: number, y: number, o?: Record<string, unknown>) => number;
  stats: () => Stats;
  clear: () => void;
};

async function openPlayground(page: Page): Promise<void> {
  await page.goto("/dev/motion");
  await page.waitForFunction(() => "__mozFx" in window);
}

const stats = (page: Page): Promise<Stats> =>
  page.evaluate(() => (window as unknown as { __mozFx: Hook }).__mozFx.stats());

const fire = (page: Page, x: number, y: number, o: Record<string, unknown> = {}): Promise<number> =>
  page.evaluate(
    ([px, py, opts]) => (window as unknown as { __mozFx: Hook }).__mozFx.burst(px, py, opts),
    [x, y, o] as const,
  );

const asleep = async (page: Page, timeout = 6_000): Promise<void> => {
  await expect.poll(async () => (await stats(page)).running, { timeout }).toBe(false);
};

test("[PD-03] one fixed canvas over every page, aria-hidden, and taps pass straight through it", async ({
  page,
}) => {
  await openPlayground(page);
  const canvas = page.locator("canvas.m-fx");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute("aria-hidden", "true");
  await expect(canvas).toHaveCSS("pointer-events", "none");
  await expect(canvas).toHaveCSS("position", "fixed");
  const press = page.getByTestId("fx-press");
  await press.scrollIntoViewIfNeeded();
  const box = await press.boundingBox();
  if (!box) throw new Error("no press button");
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  // A dense burst right over the button, then tap it mid-burst.
  expect(await fire(page, x, y, { type: "leaf", count: 120 })).toBeGreaterThan(0);
  expect((await stats(page)).running).toBe(true);
  const hit = await page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)?.closest("[data-testid]")?.getAttribute("data-testid"),
    [x, y] as const,
  );
  expect(hit).toBe("fx-press");
  await page.mouse.click(x, y);
  await expect(page.getByTestId("fx-count")).toHaveText("160");
  // Other pages have the canvas too (root layout).
  await page.goto("/dev/molten");
  await expect(page.locator("canvas.m-fx")).toHaveCount(1);
});

test("[PD-03] the loop sleeps once idle: no frames after the last particle, canvas cleared", async ({
  page,
}) => {
  await openPlayground(page);
  await fire(page, 200, 300, { type: "spark", count: 28 });
  await asleep(page);
  const s = await stats(page);
  expect(s.live).toBe(0);
  const before = s.frames;
  await page.waitForTimeout(1_000);
  const after = await stats(page);
  expect(after.frames).toBe(before);
  expect(after.running).toBe(false);
  // Nothing left painted.
  const painted = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("canvas.m-fx");
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return -1;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) n++;
    return n;
  });
  expect(painted).toBe(0);
});

test("[PD-03] canvas backing store is the viewport × DPR, capped at 2, and follows a resize", async ({
  page,
}) => {
  await openPlayground(page);
  const size = (): Promise<{ w: number; h: number; iw: number; ih: number; dpr: number }> =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>("canvas.m-fx");
      return {
        w: c?.width ?? 0,
        h: c?.height ?? 0,
        iw: innerWidth,
        ih: innerHeight,
        dpr: Math.min(2, devicePixelRatio || 1),
      };
    });
  // Not allocated until the first burst.
  expect((await size()).w).toBe(0);
  await fire(page, 100, 100, { type: "leaf", count: 40 });
  let s = await size();
  expect(s.w).toBe(Math.round(s.iw * s.dpr));
  expect(s.h).toBe(Math.round(s.ih * s.dpr));
  // Orientation change mid-burst: re-sized, still running.
  const vp = page.viewportSize() ?? { width: 390, height: 844 };
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect.poll(async () => (await size()).iw).toBe(vp.height);
  s = await size();
  expect(s.w).toBe(Math.round(s.iw * s.dpr));
  expect(s.h).toBe(Math.round(s.ih * s.dpr));
  expect((await stats(page)).running).toBe(true);
});

test("[PD-03] a hidden tab stops the loop mid-burst and resumes cleanly when visible", async ({
  page,
}) => {
  await openPlayground(page);
  await fire(page, 200, 200, { type: "leaf", count: 30 });
  const setHidden = (hidden: boolean): Promise<void> =>
    page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (h ? "hidden" : "visible"),
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  const held = await stats(page);
  expect(held.running).toBe(false);
  expect(held.live).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const still = await stats(page);
  expect(still.frames).toBe(held.frames);
  expect(still.live).toBe(held.live);
  await setHidden(false);
  expect((await stats(page)).running).toBe(true);
  await asleep(page);
  expect((await stats(page)).live).toBe(0);
});

test("[PD-03] reduced motion: no bursts at all; switched on mid-burst, the canvas clears", async ({
  page,
}) => {
  await openPlayground(page);
  await fire(page, 200, 200, { type: "leaf", count: 30 });
  expect((await stats(page)).live).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  await expect.poll(async () => (await stats(page)).live).toBe(0);
  expect((await stats(page)).running).toBe(false);
  expect(await fire(page, 200, 200, { count: 20 })).toBe(0);
  // The press kit under reduced motion: the count lands at once, no ripple animation left running.
  await page.getByTestId("fx-press").click();
  await expect(page.getByTestId("fx-count")).toHaveText("160");
  expect((await stats(page)).live).toBe(0);
});

test("[PD-03] the Me preference alone also turns reduced motion on (one source)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("moz:motion", "reduce");
  });
  await openPlayground(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  expect(await fire(page, 200, 200, { count: 20 })).toBe(0);
});

test("[PD-03] lite tier: half the particles and a 160 cap; the playground switch flips <html class=lite>", async ({
  page,
}) => {
  await openPlayground(page);
  await page.getByRole("radio", { name: "full" }).check();
  await expect(page.locator("html")).not.toHaveClass(/(^|\s)lite(\s|$)/);
  expect(await fire(page, 100, 100, { count: 20 })).toBe(20);
  await page.evaluate(() => {
    (window as unknown as { __mozFx: Hook }).__mozFx.clear();
  });
  await page.getByRole("radio", { name: "lite" }).check();
  await expect(page.locator("html")).toHaveClass(/(^|\s)lite(\s|$)/);
  expect(await fire(page, 100, 100, { count: 20 })).toBe(10);
  for (let i = 0; i < 30; i++) await fire(page, 100, 100, { count: 28 });
  expect((await stats(page)).live).toBe(160);
  expect((await stats(page)).cap).toBe(160);
  // The override survives a reload in this tab; "Follow the device" drops it.
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/(^|\s)lite(\s|$)/);
  await page.getByRole("button", { name: "Follow the device" }).click();
  await expect(page.locator("html")).not.toHaveClass(/(^|\s)lite(\s|$)/);
});

test("[PD-03] a route change mid-burst: particles finish over the new page, which works at once", async ({
  page,
}) => {
  await openPlayground(page);
  // Keep a handle on the engine's stats: the playground (and its window hook) unmounts on navigation.
  await page.evaluate(() => {
    const w = window as unknown as { __mozFx: Hook; __fxStats: () => Stats };
    w.__fxStats = w.__mozFx.stats;
    w.__mozFx.burst(200, 200, { type: "leaf", count: 30 });
  });
  await page.getByRole("link", { name: "Open a detail page" }).click();
  await expect(page).toHaveURL(/\/dev\/motion\/details$/);
  const mid = await page.evaluate(() =>
    (window as unknown as { __fxStats: () => Stats }).__fxStats(),
  );
  expect(mid.mounted).toBe(true);
  expect(mid.live).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Tap me" }).click();
  await expect(page.getByTestId("tap-count")).toHaveText("1 tap");
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as { __fxStats: () => Stats }).__fxStats().live),
      {
        timeout: 6_000,
      },
    )
    .toBe(0);
});

test("[PD-03] press kit: pressed state, a ripple from the press point, celebrate throws 28 sparks + 6 coins", async ({
  page,
}) => {
  await openPlayground(page);
  const press = page.getByTestId("fx-press");
  await press.scrollIntoViewIfNeeded();
  const box = await press.boundingBox();
  if (!box) throw new Error("no press button");
  await page.mouse.move(box.x + 30, box.y + 20);
  await page.mouse.down();
  await expect(press).toHaveClass(/(^|\s)down(\s|$)/);
  await expect(press.locator(".m-ripple")).toHaveCount(1);
  await page.mouse.up();
  await expect(press).not.toHaveClass(/(^|\s)down(\s|$)/);
  // The click celebrated: 28 sparks + 6 coins on a full-tier device (14 + 3 on lite).
  const live = (await stats(page)).live;
  const lite = await page.evaluate(() => document.documentElement.classList.contains("lite"));
  expect(live).toBeLessThanOrEqual(lite ? 17 : 34);
  expect(live).toBeGreaterThan(0);
  await expect(press.locator(".m-ripple")).toHaveCount(0, { timeout: 2_000 });
  await expect(page.getByTestId("fx-count")).toHaveText("160");
});

/**
 * DESIGN §12 frame budget at 4× CPU (the CI runner as the reference device): 200 bursts fed two per frame keep
 * the engine at its cap; every frame until it sleeps is timed, and long tasks are recorded throughout.
 */
test("[PD-03] 200-burst stress at 4× CPU: 60 fps, p95 ≤ 16.8 ms, no long task over 50 ms", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "chromium",
    "CPU throttling is a Chromium DevTools feature",
  );
  await page.addInitScript(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ type: "longtask", buffered: false });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlayground(page);
  await page.getByRole("radio", { name: "full" }).check();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    (window as unknown as { __long: number[] }).__long = [];
  });
  const { cdp } = await throttleCpu(page, test.info());
  const run = await page.evaluate(async () => {
    const w = window as unknown as { __mozFx: Hook; __long: number[] };
    const times: number[] = [];
    let fired = 0;
    let peak = 0;
    const start = performance.now();
    while (performance.now() - start < 8_000) {
      if (fired < 200) {
        for (let k = 0; k < 2 && fired < 200; k++, fired++)
          w.__mozFx.burst(40 + ((fired * 37) % 310), 140 + ((fired * 53) % 560), { count: 20 });
      }
      times.push(await new Promise<number>(requestAnimationFrame));
      const s = w.__mozFx.stats();
      peak = Math.max(peak, s.live);
      if (fired >= 200 && !s.running) break;
    }
    return { times, peak, fired, long: w.__long };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const { times } = run;
  const gaps = times.slice(1).map((t, i) => t - (times[i] ?? t));
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const fps = (1000 * gaps.length) / gaps.reduce((s, g) => s + g, 0);
  const longest = Math.max(0, ...run.long);
  test.info().annotations.push({
    type: "fx stress trace",
    description: `${String(run.fired)} bursts, peak ${String(run.peak)} particles, ${String(times.length)} frames, ${fps.toFixed(1)} fps, p95 ${p95.toFixed(1)} ms, long tasks ${String(run.long.length)} (max ${longest.toFixed(0)} ms)`,
  });
  console.warn(
    `[fx-trace] bursts ${String(run.fired)} peak ${String(run.peak)} frames ${String(times.length)} fps ${fps.toFixed(1)} p95 ${p95.toFixed(1)} long ${String(run.long.length)}/${longest.toFixed(0)}`,
  );
  expect(run.fired).toBe(200);
  expect(run.peak).toBe(420);
  expect(times.length).toBeGreaterThan(60);
  expect(fps).toBeGreaterThanOrEqual(58);
  expect(p95).toBeLessThanOrEqual(16.8);
  expect(longest).toBeLessThanOrEqual(50);
});
