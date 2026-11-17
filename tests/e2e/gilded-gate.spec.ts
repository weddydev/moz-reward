import { mkdirSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test, testApiHeaders } from "./support/test";

/**
 * P1-03 Gilded Gate on the production build (DESIGN §8.1): plays for `src=qr|nfc` once per shop per session,
 * never without `src` (nor loads its chunk), skips on tap/key with no layout jump, 150ms fade under reduced
 * motion, no replay on back or reload, ≈ 1.4s, no CLS. Frames at 0 / 0.5 / 1.0 / 1.4s are saved to
 * .artifacts/screens/P1-03 for inspection (390, 320, 1440).
 */

type GateLog = { states: { s: string | null; t: number }[] };

/** Records the gate's data-state changes from before any page script; `pause` freezes every animation at
 *  the gate's first frame so a test can seek the timeline (deterministic frames, no race with a slow load). */
async function watchGate(page: Page, pause = false): Promise<void> {
  await page.addInitScript((freeze: boolean) => {
    const w = window as unknown as { __gate: GateLog };
    w.__gate = { states: [] };
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (el.id !== "gilded-gate") continue;
        const s = el.getAttribute("data-state");
        w.__gate.states.push({ s, t: performance.now() });
        if (s === "play" && freeze) for (const a of document.getAnimations()) a.pause();
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
  }, pause);
}
const gateLog = (page: Page): Promise<GateLog> =>
  page.evaluate(() => (window as unknown as { __gate: GateLog }).__gate);
const gateState = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.getElementById("gilded-gate")?.getAttribute("data-state") ?? null);

/** Seek every animation on the page (the gate, the page's rise, the morph clone) to `ms`. */
const seek = (page: Page, ms: number): Promise<void> =>
  page.evaluate((t) => {
    for (const a of document.getAnimations()) a.currentTime = t;
  }, ms);

async function seedShop(
  request: APIRequestContext,
  name = "Brew & Bloom Café",
): Promise<{ shopCode: string }> {
  const res = await request.post("/api/test/shop", {
    data: { status: "active", name, details: true },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopCode: string };
}

test("[P1-03] plays with src=qr, ≈ 1.4s, hides itself; arrival stays silent before any gesture", async ({
  page,
  request,
}) => {
  const { shopCode } = await seedShop(request);
  await watchGate(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __audioMade: number; AudioContext?: typeof AudioContext };
    w.__audioMade = 0;
    const Real = w.AudioContext;
    if (!Real) return;
    w.AudioContext = class extends Real {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audioMade += 1;
      }
    };
  });
  await page.goto(`/s/${shopCode}?src=qr`);
  await expect.poll(() => gateState(page), { timeout: 5000 }).toBe("done");
  const { states } = await gateLog(page);
  expect(states.map((x) => x.s)).toEqual(["play", "done"]);
  const [play, done] = states;
  const ran = (done?.t ?? 0) - (play?.t ?? 0);
  expect(ran).toBeGreaterThanOrEqual(1300); // it ends itself (animationend), not cut short
  expect(ran).toBeLessThan(3000);
  await expect(page.getByTestId("gilded-gate")).toBeHidden();
  await expect(page.getByTestId("landing-collect")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __audioMade: number }).__audioMade),
  ).toBe(0);
});

test("[P1-03] the timeline lasts 1.4s and the morph lands exactly on the cover", async ({
  page,
  request,
}) => {
  const { shopCode } = await seedShop(request);
  await watchGate(page, true);
  await page.goto(`/s/${shopCode}?src=nfc`);
  await expect(page.locator("[data-gate-panel]")).toHaveCount(1); // the chunk joined in step
  const end = await page.evaluate(() =>
    Math.max(
      ...document.getAnimations().map((a) => Number(a.effect?.getComputedTiming().endTime ?? 0)),
    ),
  );
  expect(end).toBe(1400);
  const coverOpacity = (): Promise<string> =>
    page.locator("[data-gate-cover]").evaluate((el) => getComputedStyle(el).opacity);
  await seek(page, 1200); // mid-morph: one cover on screen, the clone
  expect(await coverOpacity()).toBe("0");
  await seek(page, 1399.9);
  const [panel, cover] = await page.evaluate(() =>
    ["[data-gate-panel]", "[data-gate-cover]"].map((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? [r.left, r.top, r.width, r.height] : [];
    }),
  );
  expect(panel).toHaveLength(4);
  panel?.forEach((v, i) => {
    expect(Math.abs(v - (cover?.[i] ?? Number.NaN))).toBeLessThan(1);
  });
  // The clone is decoration: no duplicate test ids or ids, nothing focusable.
  expect(
    await page.locator("[data-gate-panel] [data-testid], [data-gate-panel] [id]").count(),
  ).toBe(0);
  await page.mouse.click(10, 10); // skip: the real cover is back at once
  expect(await coverOpacity()).toBe("1");
});

test("[P1-03] not played without src (nor for src=code), and its chunk is never loaded then", async ({
  page,
  request,
}) => {
  const { shopCode } = await seedShop(request);
  const scripts =
    (into: Set<string>) =>
    (r: { url: () => string; request: () => { resourceType: () => string } }) => {
      if (r.request().resourceType() === "script") into.add(new URL(r.url()).pathname);
    };

  const plain = new Set<string>();
  page.on("response", scripts(plain));
  for (const q of ["", "?src=code", "?src=QR"]) {
    await page.goto(`/s/${shopCode}${q}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("gilded-gate")).toHaveCount(0);
    await expect(page.getByTestId("landing-collect")).toBeVisible();
  }
  page.removeAllListeners("response");

  const scanned = new Set<string>();
  page.on("response", scripts(scanned));
  await page.goto(`/s/${shopCode}?src=qr`);
  await page.waitForLoadState("networkidle");
  await expect.poll(() => gateState(page), { timeout: 5000 }).toBe("done");
  const extra = [...scanned].filter((u) => !plain.has(u));
  expect(extra.length).toBeGreaterThan(0);
  for (const url of extra) {
    const body = await (await page.request.get(url)).body();
    expect(gzipSync(body).length, url).toBeLessThanOrEqual(35 * 1024); // DESIGN §12: ≤ 35 KB gzip
  }
});

test("[P1-03] a tap or a key skips at once, with no layout jump", async ({
  page,
  request,
  browserName,
}) => {
  const { shopCode } = await seedShop(request);
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          w.__cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      /* WebKit: no layout-shift entries */
    }
  });
  await watchGate(page, true);
  const rect = (): Promise<number[]> =>
    page.getByTestId("landing-collect").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height];
    });

  await page.goto(`/s/${shopCode}?src=qr`);
  await seek(page, 600); // mid-logo
  await page.mouse.click(200, 300);
  expect(await gateState(page)).toBe("done");
  await expect(page.getByTestId("gilded-gate")).toBeHidden();
  const right = await rect();
  // The page is at its final state at once: no rise still running, nothing moves afterwards.
  expect(
    await page.evaluate(
      () =>
        document.querySelectorAll("[data-gate-rise]").length > 0 &&
        [...document.querySelectorAll("[data-gate-rise]")].every(
          (el) => el.getAnimations().length === 0,
        ),
    ),
  ).toBe(true);
  await page.waitForTimeout(300);
  expect(await rect()).toEqual(right);
  if (browserName === "chromium") {
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  }
  await expect(page.getByTestId("landing-collect")).toBeInViewport();

  // A second shop in the same tab plays (one key per shop); a key skips it.
  const other = await seedShop(request, "Second Shop");
  await page.goto(`/s/${other.shopCode}?src=qr`);
  expect(await gateState(page)).toBe("play");
  await page.keyboard.press("Escape");
  expect(await gateState(page)).toBe("done");
});

test("[P1-03] reduced motion: a 150ms fade, nothing moves", async ({ page, request }) => {
  const { shopCode } = await seedShop(request);
  await watchGate(page, true);
  const check = async (): Promise<void> => {
    const anims = await page.evaluate(() => {
      const gate = document.getElementById("gilded-gate");
      const rise = [...document.querySelectorAll("[data-gate-rise]")];
      return {
        own: (gate?.getAnimations() ?? []).map((a) => ({
          name: (a as CSSAnimation).animationName,
          duration: Number(a.effect?.getComputedTiming().duration ?? 0),
        })),
        inner: (gate?.getAnimations({ subtree: true }) ?? []).length,
        rise: rise.reduce((n, el) => n + el.getAnimations().length, 0),
        panel: document.querySelectorAll("[data-gate-panel]").length,
      };
    });
    expect(anims.own).toEqual([{ name: "gate-fade", duration: 150 }]);
    expect(anims.inner).toBe(1); // only the gate's own fade
    expect(anims.rise).toBe(0);
    expect(anims.panel).toBe(0);
  };

  // System setting.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/s/${shopCode}?src=qr`);
  expect(await gateState(page)).toBe("play");
  await page.waitForLoadState("networkidle"); // give the chunk every chance to (not) morph
  await check();

  // The user's own "Reduce animations" choice with the system on full motion.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const other = await seedShop(request, "Reduced Toggle Shop");
  await page.evaluate(() => {
    localStorage.setItem("moz:motion", "reduce");
  });
  await page.goto(`/s/${other.shopCode}?src=qr`);
  expect(await page.evaluate(() => document.documentElement.dataset.reduceMotion)).toBe("true");
  await page.waitForLoadState("networkidle");
  await check();
});

test("[P1-03] no replay on back navigation or reload within the session", async ({
  page,
  request,
}) => {
  const { shopCode } = await seedShop(request);
  await watchGate(page);
  await page.goto(`/s/${shopCode}?src=qr`);
  await expect.poll(() => gateState(page), { timeout: 5000 }).toBe("done");

  await page.getByTestId("landing-collect").click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/s/${shopCode}\\?src=qr$`));
  await expect(page.getByTestId("landing-collect")).toBeVisible();
  expect(await gateState(page)).not.toBe("play");
  await expect(page.getByTestId("gilded-gate")).toBeHidden();

  await page.reload();
  await expect(page.getByTestId("landing-collect")).toBeVisible();
  expect((await gateLog(page)).states.map((x) => x.s)).toEqual([]);
  await expect(page.getByTestId("gilded-gate")).toBeHidden();
});

type Frame = {
  start: number;
  duration: number;
  scripts: { url: string; duration: number }[];
};
type LoadProfile = {
  frames: Frame[];
  scripts: string[];
  play: number | null;
  paint: number;
  doc: string;
};

/** Long animation frames (with their script attribution) and loaded scripts for one throttled load. */
async function profileLoad(page: Page, url: string): Promise<LoadProfile> {
  const p = await page.context().newPage();
  await p.addInitScript(() => {
    const w = window as unknown as { __frames: Frame[] };
    w.__frames = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        scripts: { sourceURL: string; duration: number }[];
      })[]) {
        w.__frames.push({
          start: e.startTime,
          duration: e.duration,
          scripts: e.scripts.map((x) => ({ url: x.sourceURL, duration: x.duration })),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  });
  await watchGate(p);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await p.goto(url);
  await p.waitForTimeout(2500); // past the 1.4s gate, slowed down
  const profile = await p.evaluate(() => ({
    frames: (window as unknown as { __frames: Frame[] }).__frames,
    scripts: performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .filter((u) => new URL(u).pathname.endsWith(".js")), // <script> and <link rel=preload> alike
    play:
      (window as unknown as { __gate: GateLog }).__gate.states.find((x) => x.s === "play")?.t ??
      null,
    paint: performance.getEntriesByName("first-paint")[0]?.startTime ?? 0,
    doc: location.href,
  }));
  await p.close();
  return profile;
}

/*
 * DESIGN §12 "no long tasks > 50ms during animations", at 4× CPU. The gate plays from first paint, so the
 * page's own bootstrap (Next's framework chunk: react-dom + hydration, ~80–160ms at 4×, the same on every
 * page with or without the gate) always falls inside its 1.4s. What this proves is that the gate adds none:
 * no long frame is the gate's doing (its inline script or chunk), every long script is one the plain landing
 * runs too, and the only script-less long frame is the first paint itself (DECISIONS 17 Nov). The gate's
 * motion after the 200ms outline is transform/opacity, which the compositor keeps running through that task.
 */
test("[P1-03] adds no long task while it plays, 4× CPU throttle (Chromium)", async ({
  page,
  request,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "CPU throttling and long-animation-frame are Chromium-only",
  );
  const { shopCode } = await seedShop(request);
  const plain = await profileLoad(page, `/s/${shopCode}`);
  const scanned = await profileLoad(page, `/s/${shopCode}?src=qr`);
  expect(plain.play).toBeNull();
  const play = scanned.play;
  expect(play).not.toBeNull();
  const from = play ?? 0;
  const gateCode = new Set([
    scanned.doc,
    ...scanned.scripts.filter((u) => !plain.scripts.includes(u)),
  ]);
  const during = scanned.frames.filter((f) => f.start + f.duration > from && f.start < from + 1400);
  const report = JSON.stringify({ during, gateCode: [...gateCode] });
  for (const f of during) {
    for (const x of f.scripts) {
      if (gateCode.has(x.url)) expect(x.duration, report).toBeLessThan(50);
      if (x.duration >= 50) expect(plain.scripts, report).toContain(x.url);
    }
    if (f.scripts.length === 0) expect(f.start, report).toBeLessThanOrEqual(scanned.paint);
  }
});

test("[P1-03] frames at 0 / 0.5 / 1.0 / 1.4s (390, 320, 1440)", async ({
  page,
  request,
}, testInfo) => {
  const { shopCode } = await seedShop(request);
  await watchGate(page, true);
  const dir = path.join(".artifacts", "screens", "P1-03");
  mkdirSync(dir, { recursive: true });
  for (const [w, h] of [
    [390, 844],
    [320, 720],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page
      .evaluate(() => {
        sessionStorage.clear();
      })
      .catch(() => undefined);
    await page.goto(`/s/${shopCode}?src=qr`);
    expect(await gateState(page)).toBe("play");
    await expect(page.locator("[data-gate-panel]")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    for (const ms of [0, 500, 1000, 1200, 1400]) {
      await seek(page, ms);
      await page.screenshot({
        path: path.join(dir, `gate-${String(w)}-${String(ms)}ms--${testInfo.project.name}.png`),
        animations: "allow",
        caret: "initial",
      });
    }
  }
});

test("[P1-03] /dev/motion replays the gate for a shop code", async ({ page, request }) => {
  const { shopCode } = await seedShop(request);
  await watchGate(page);
  await page.goto(`/s/${shopCode}?src=qr`);
  await expect.poll(() => gateState(page), { timeout: 5000 }).toBe("done");
  await page.goto("/dev/motion");
  await page.getByTestId("gate-preview-code").fill(shopCode.toLowerCase());
  await page.getByRole("button", { name: "Replay as an NFC tap" }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${shopCode}\\?src=nfc$`));
  expect((await gateLog(page)).states[0]?.s).toBe("play");
});
