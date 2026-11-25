import { mkdirSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { type APIRequestContext, type Page } from "@playwright/test";
import { medianFrameRate, throttleCpu, LONG_TASK_MS } from "./support/cpu-throttle";
import { expect, test, testApiHeaders } from "./support/test";

/**
 * P1-03 / PD-09 Gilded Gate 2.0 on the production build (DESIGN §8.1): plays for `src=qr|nfc` once per shop per
 * session, never without `src` (nor loads its chunk), skips on tap/key with no layout jump, 150ms fade under
 * reduced motion, no replay on back or reload, hands off once the name has forged (3.28 s for "Brew & Bloom
 * Café", `gateTimeline`), no CLS. Beat frames (spark, converge, ignite, orbit, forge, hand-off) are saved to
 * .artifacts/screens/PD-09 for inspection (390, 320, 1440, landscape) next to the reference's intro-*.jpg.
 */

type GateLog = { states: { s: string | null; t: number }[]; startedAt: number | null };

/** "Brew & Bloom Café": 14 letters → the hand-off at 2880 ms, 3280 ms in all (`gateTimeline(14)`). */
const HANDOFF_MS = 2880;
const TOTAL_MS = 3280;

/** Records the gate's data-state changes (and when its own animation really started) from before any page
 *  script; `pause` freezes every animation at the gate's first frame so a test can seek the timeline
 *  (deterministic frames, no race with a slow load). */
async function watchGate(page: Page, pause = false): Promise<void> {
  await page.addInitScript((freeze: boolean) => {
    const w = window as unknown as { __gate: GateLog };
    w.__gate = { states: [], startedAt: null };
    // `play` is set before the first paint; the CSS animation starts with it, which a starved runner can
    // delay by seconds (WebKit, run 44689683099), so the duration is measured from here.
    addEventListener(
      "animationstart",
      (e) => {
        if ((e.target as HTMLElement).id === "gilded-gate" && w.__gate.startedAt === null)
          w.__gate.startedAt = performance.now();
      },
      true,
    );
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
    // Pause too: the page's rise animations start after the gate's (its markup is parsed later), so the
    // pause at "play" never saw them.
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
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

test("[PD-09] plays with src=qr for 3.28 s, hides itself; arrival stays silent before any gesture", async ({
  page,
  request,
  browserName,
}) => {
  test.fixme(
    process.env.CI !== undefined && browserName === "webkit",
    "C-83: Linux WebKit (CI only) ends 6.8 s after start vs < 4.88 s (wall-clock bound, ~1 frame/s after load, KI-10); passes on the Mac's WebKit",
  );
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
  await expect.poll(() => gateState(page), { timeout: 8000 }).toBe("done");
  const { states, startedAt } = await gateLog(page);
  expect(states.map((x) => x.s)).toEqual(["play", "done"]);
  const [play, done] = states;
  expect(startedAt).not.toBeNull();
  expect(startedAt ?? 0).toBeGreaterThanOrEqual(play?.t ?? 0);
  // `play` comes before the animation's real start and `animationstart` is dispatched at or after it, so each
  // bound uses the clock that can't flatter it: not cut short from `play`, not stuck from `animationstart`
  // (a starved runner can delay the first paint by seconds; the start event itself can land a frame late).
  const fromPlay = (done?.t ?? 0) - (play?.t ?? 0);
  const fromStart = (done?.t ?? 0) - (startedAt ?? 0);
  expect(fromPlay).toBeGreaterThanOrEqual(TOTAL_MS - 100); // it ends itself (animationend), not cut short
  expect(fromStart).toBeLessThan(TOTAL_MS + 1600);
  await expect(page.getByTestId("gilded-gate")).toBeHidden();
  await expect(page.getByTestId("landing-collect")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __audioMade: number }).__audioMade),
  ).toBe(0);
});

test("[PD-09] the timeline lasts 3.28 s and the morph grows the cover out of the coin", async ({
  page,
  request,
}) => {
  const { shopCode } = await seedShop(request);
  await watchGate(page, true);
  await page.goto(`/s/${shopCode}?src=nfc`);
  await expect(page.getByTestId("gilded-gate")).toHaveAttribute("data-morph", ""); // the inline morph joined in step
  // The timeline is every finite animation outside the scene (the gate, the page's rise, the morph clone). Idle
  // loops on the page underneath (PD-04: the molten button's flowing fill; the gilded edge, the living
  // background) never end, so their Infinity is not part of it (CI 45006025356). The scene's shine may run on
  // past the hand-off: it goes with the hidden gate.
  // The scene starts in the first frame after the inline script: wait for its beats.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector("#gilded-gate .gate-stage")?.getAnimations({ subtree: true })
            .length ?? 0,
      ),
    )
    .toBeGreaterThan(20);
  const ends = await page.evaluate(() => {
    const scene = document.querySelector("#gilded-gate .gate-stage");
    const all = document.getAnimations().map((a) => ({
      inScene: !!scene && scene.contains((a.effect as KeyframeEffect | null)?.target ?? null),
      end: Number(a.effect?.getComputedTiming().endTime ?? 0),
    }));
    const finite = (xs: typeof all): number[] => xs.map((x) => x.end).filter(Number.isFinite);
    return {
      outside: Math.max(...finite(all.filter((x) => !x.inScene))),
      scene: finite(all.filter((x) => x.inScene)).length,
    };
  });
  expect(ends.outside).toBeCloseTo(TOTAL_MS, 3); // the rise delay is a calc(): 3280.0000000000005
  expect(ends.scene).toBeGreaterThan(20); // the inline scene script played the beats (letters, coin, rays…)
  // Exactly one flash (WCAG 2.3.1): one animation on the flash, one iteration, a single peak (0 → .95 → 0).
  const flash = await page.evaluate(() =>
    (document.querySelector("#gilded-gate .gate-flash")?.getAnimations() ?? []).map((a) => ({
      iterations: a.effect?.getTiming().iterations,
      opacity: (a.effect as KeyframeEffect).getKeyframes().map((k) => Number(k.opacity)),
    })),
  );
  expect(flash).toEqual([{ iterations: 1, opacity: [0, 0.95, 0] }]);
  const coverOpacity = (): Promise<string> =>
    page.locator("[data-gate-cover]").evaluate((el) => getComputedStyle(el).opacity);
  await seek(page, HANDOFF_MS + 200); // mid-morph: one cover on screen, the clone
  expect(await coverOpacity()).toBe("0");
  // The rising content sits above the clone (no half-covered logo snapping in at the end) and lets taps through
  // to the gate (a tap skips; nothing below is pressed by accident).
  const rise = await page.evaluate(() =>
    [...document.querySelectorAll("[data-gate-rise]")].map((el) => {
      const cs = getComputedStyle(el);
      // The cover's logo keeps its corner (absolute); everything else lifts in place (PD-11).
      const at = el.classList.contains("m-cover-logo") ? "absolute" : "relative";
      return `${cs.position === at ? "kept" : cs.position} ${cs.zIndex} ${cs.pointerEvents}`;
    }),
  );
  expect(rise.length).toBeGreaterThan(0);
  expect(new Set(rise)).toEqual(new Set(["kept 61 none"]));
  expect(
    await page.evaluate(() => {
      const r = document.querySelector("[data-testid=landing-collect]")?.getBoundingClientRect();
      const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return hit?.closest("#gilded-gate")?.id ?? null;
    }),
  ).toBe("gilded-gate");
  await seek(page, TOTAL_MS - 0.1);
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
  await expect.poll(() => gateState(page), { timeout: 8000 }).toBe("done");
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
    const w = window as unknown as { __cls: number; __shifted: string[] };
    w.__cls = 0;
    w.__shifted = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources: { node?: Node }[];
        })[]) {
          if (e.hadRecentInput) continue; // as CLS itself counts
          w.__cls += e.value;
          for (const x of e.sources) {
            const el = x.node instanceof Element ? x.node : x.node?.parentElement;
            w.__shifted.push(
              `${el?.tagName ?? "?"}${el?.getAttribute("data-testid") ? `#${el.getAttribute("data-testid") ?? ""}` : ""}:${String(e.value)}`,
            );
          }
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
  await seek(page, 600); // mid-convergence
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
    // The gate is fixed and the rise is transform-only, so neither can shift layout. Linux CI showed a
    // sub-pixel shift (CLS 0.00004) from the page's own font swap; "no CLS" = nothing a person could see.
    const { cls, shifted } = await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __shifted: string[] };
      return { cls: w.__cls, shifted: w.__shifted };
    });
    expect(cls, shifted.join(", ")).toBeLessThan(0.001);
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
        morph: gate?.hasAttribute("data-morph") ?? false,
      };
    });
    expect(anims.own).toEqual([{ name: "gate-fade", duration: 150 }]);
    expect(anims.inner).toBe(1); // only the gate's own fade
    expect(anims.rise).toBe(0);
    expect(anims.morph).toBe(false);
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
  await expect.poll(() => gateState(page), { timeout: 8000 }).toBe("done");

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
  morphed: boolean;
};

/** Long animation frames (with their script attribution) and loaded scripts for one throttled load. */
async function profileLoad(page: Page, url: string): Promise<LoadProfile> {
  const info = test.info();
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
  await throttleCpu(p, info);
  await p.goto(url);
  await p.waitForTimeout(4500); // past the 3.28 s gate, slowed down
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
    morphed: document.getElementById("gilded-gate")?.hasAttribute("data-morph") ?? false,
    doc: location.href,
  }));
  await p.close();
  return profile;
}

/*
 * DESIGN §12 "no long tasks > 50ms during animations", at 4× CPU. The gate plays from first paint, so the
 * page's own bootstrap (Next's framework chunk: react-dom + hydration, ~80–160ms at 4×, the same on every
 * page with or without the gate) always falls inside its 3.28 s. What this proves is that the gate adds none:
 * no long frame is the gate's doing (its inline script or chunk), every long script is one the plain landing
 * runs too, and no script-less frame after first paint is over the long-task limit (DECISIONS 17 Nov, 24 Nov).
 * Most of the gate's motion is transform/opacity, which the compositor keeps running through that task.
 */
test("[PD-09] adds no long task while it plays, 4× CPU throttle (Chromium) @perf", async ({
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
  // The morph is an inline script, so it joins in time even on a 4× slower CPU (design review P1-03).
  expect(scanned.morphed).toBe(true);
  const from = play ?? 0;
  const gateCode = new Set([
    scanned.doc,
    ...scanned.scripts.filter((u) => !plain.scripts.includes(u)),
  ]);
  const during = scanned.frames.filter(
    (f) => f.start + f.duration > from && f.start < from + TOTAL_MS,
  );
  const report = JSON.stringify({ during, gateCode: [...gateCode] });
  for (const f of during) {
    for (const x of f.scripts) {
      // The gate's own scripts hold the same limit (C-82: its start runs the canvas in one frame and the beats in
      // the next, so neither carries both).
      if (gateCode.has(x.url)) expect(x.duration, report).toBeLessThanOrEqual(LONG_TASK_MS);
      else if (x.duration > LONG_TASK_MS) expect(plain.scripts, report).toContain(x.url);
    }
    // Rendering-only frames after first paint (PD-09: the letter forge's weight axis and letter-spacing, the
    // hand-off's clip-path; ~56–60 ms at 4×) stay within the long-task limit too.
    if (f.scripts.length === 0 && f.start > scanned.paint)
      expect(f.duration, report).toBeLessThanOrEqual(LONG_TASK_MS);
  }
});

/** The beats captured for inspection: spark, converge, late converge, ignite, orbit + forge, forged, the
 *  hand-off morph and its last frame (next to design/reference/molten/screenshots/intro-*.jpg). */
const BEAT_MS = [260, 700, 1150, 1450, 2300, 2800, HANDOFF_MS + 200, TOTAL_MS - 1] as const;

test("[PD-09] beat frames (390, 320, 1440, landscape 844 × 390)", async ({
  page,
  request,
}, testInfo) => {
  // Four loads and 32 full-page screenshots: about 25 s on the host, more in the Linux container (gate 24 Nov).
  test.setTimeout(120_000);
  const { shopCode } = await seedShop(request);
  // The page clock drives the canvas (rAF) and every animation is seeked, so each frame is the same instant.
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:00:01Z"));
  await watchGate(page, true);
  const dir = path.join(".artifacts", "screens", "PD-09");
  mkdirSync(dir, { recursive: true });
  for (const [w, h] of [
    [390, 844],
    [320, 720],
    [1440, 900],
    [844, 390],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page
      .evaluate(() => {
        sessionStorage.clear();
      })
      .catch(() => undefined);
    await page.goto(`/s/${shopCode}?src=qr`);
    expect(await gateState(page)).toBe("play");
    await expect(page.getByTestId("gilded-gate")).toHaveAttribute("data-morph", "");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    let at = 0;
    for (const ms of BEAT_MS) {
      await page.clock.runFor(ms - at);
      at = ms;
      await seek(page, ms);
      await page.screenshot({
        path: path.join(
          dir,
          `gate-${String(w)}x${String(h)}-${String(ms)}ms--${testInfo.project.name}.png`,
        ),
        animations: "allow",
        caret: "initial",
      });
    }
    // The name fits: no letter outside the viewport at the forged frame.
    await seek(page, 2800);
    const out = await page.evaluate(
      () =>
        [...document.querySelectorAll("#gilded-gate .gate-ch")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < 0 || r.right > innerWidth || r.bottom > innerHeight;
        }).length,
    );
    expect(out, `${String(w)}×${String(h)}`).toBe(0);
  }
  await page.clock.resume(); // the guard's closing axe scan needs timers
});

test("[P1-03] /dev/motion replays the gate for a shop code", async ({ page, request }) => {
  const { shopCode } = await seedShop(request);
  await watchGate(page);
  await page.goto(`/s/${shopCode}?src=qr`);
  await expect.poll(() => gateState(page), { timeout: 8000 }).toBe("done");
  await page.goto("/dev/motion");
  await page.getByTestId("gate-preview-code").fill(shopCode.toLowerCase());
  await page.getByRole("button", { name: "Replay as an NFC tap" }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${shopCode}\\?src=nfc$`));
  expect((await gateLog(page)).states[0]?.s).toBe("play");
  // The guard's closing axe scan reads the landing: let the replayed gate hand off first (its settle wait caps at
  // 3 s, and on CI's iPhone WebKit the gate plus the landing's fade-in ran past it: low contrast, CI 45404530673).
  await expect.poll(() => gateState(page), { timeout: 8000 }).toBe("done");
});

test("[PD-09] long names wrap by word and fit at 320; no logo: the coin carries the initials", async ({
  page,
  request,
}) => {
  const name = "The Extraordinarily Wonderful Neighbourhood Patisserie";
  const { shopCode } = await seedShop(request, name);
  await watchGate(page, true);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/s/${shopCode}?src=qr`);
  expect(await gateState(page)).toBe("play");
  // The scene starts in the first frame (WebKit on Linux CI can take a second to draw it, KI-10): wait for the
  // last letter's beat, then seek. 50 letters: the stagger shrinks so it lands by 3.2 s (gateTimeline).
  await expect
    .poll(() =>
      page
        .locator("#gilded-gate .gate-ch")
        .last()
        .evaluate((c) => c.getAnimations().length),
    )
    .toBeGreaterThan(0);
  await seek(page, 3199);
  const layout = await page.evaluate(() => {
    const words = [...document.querySelectorAll("#gilded-gate .gate-word")];
    return {
      words: words.length,
      // Every word on one line (its letters share a top), and inside the viewport.
      broken: words.filter(
        (w) =>
          new Set([...w.children].map((c) => Math.round(c.getBoundingClientRect().top))).size > 1,
      ).length,
      outside: [...document.querySelectorAll("#gilded-gate .gate-ch")].filter((c) => {
        const r = c.getBoundingClientRect();
        return r.left < 0 || r.right > innerWidth;
      }).length,
      lines: new Set(words.map((w) => Math.round(w.getBoundingClientRect().top))).size,
      opacity: getComputedStyle(
        document.querySelector("#gilded-gate .gate-ch:last-child") ?? document.body,
      ).opacity,
      initials: document.querySelector("#gilded-gate .gate-initials")?.textContent ?? null,
      image: document.querySelectorAll("#gilded-gate .gate-coin image").length,
    };
  });
  expect(layout.words).toBe(5);
  expect(layout.broken).toBe(0);
  expect(layout.outside).toBe(0);
  expect(layout.lines).toBeGreaterThan(1); // it wrapped, by word
  expect(layout.opacity).toBe("1"); // forged by 3.2 s
  expect(layout.initials).toMatch(/^[A-Z]{1,2}$/);
  expect(layout.image).toBe(0);
  await expect(page.locator("#gilded-gate")).toHaveCSS("--gate-handoff", "3200ms");
});

test.describe("[PD-09] font blocked", () => {
  // The display font is blocked on purpose: those failed requests are the test, not a problem.
  test.use({
    // One pattern: a two-item array would read as Playwright's [value, options] fixture form.
    guardAllow: [
      /^(requestfailed: GET \S+\.woff2 (net::ERR_FAILED|Blocked by Web Inspector)|console: Failed to load resource: net::ERR_FAILED)/,
    ],
  });

  test("[PD-09] the letters don't wait for the display font; a hidden tab ends the gate", async ({
    page,
    request,
  }) => {
    const { shopCode } = await seedShop(request);
    // The display font never arrives: the letters forge on time in the fallback face (as the reference does after
    // 1.2 s), and the gate still ends on its own.
    await page.route(/\.woff2(\?|$)/, (route) => route.abort());
    await watchGate(page);
    await page.goto(`/s/${shopCode}?src=qr`);
    expect(await gateState(page)).toBe("play");
    await expect
      .poll(() =>
        page
          .locator("#gilded-gate .gate-ch")
          .first()
          .evaluate((c) => c.getAnimations().length),
      )
      .toBeGreaterThan(0);
    const forge = await page.evaluate(() =>
      [...document.querySelectorAll("#gilded-gate .gate-ch")].map((c) => {
        const a = c.getAnimations()[0];
        return a?.effect?.getTiming().delay ?? -1;
      }),
    );
    expect(forge.length).toBe(14);
    expect(new Set(forge)).toEqual(new Set([1480])); // each letter's beat; its own lead is held inside it
    await expect.poll(() => gateState(page), { timeout: 8000 }).toBe("done");

    // A second shop: the tab goes to the background mid-play, and the gate finishes at its end state.
    const other = await seedShop(request, "Hidden Tab Shop");
    await page.goto(`/s/${other.shopCode}?src=qr`);
    expect(await gateState(page)).toBe("play");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await gateState(page)).toBe("done");
    await expect(page.getByTestId("landing-collect")).toBeVisible();
  });
});

/** One throttled load of the gate on `tier`: frame intervals from rAF during the convergence (300–1250 ms). */
async function convergeRun(
  page: Page,
  shopCode: string,
  tier: "full" | "lite",
): Promise<{ fps: number; p95: number; frames: number }> {
  const p = await page.context().newPage();
  await p.addInitScript((t: string) => {
    sessionStorage.setItem("moz:tier", t);
    const w = window as unknown as { __frames: number[]; __playAt: number | null };
    w.__frames = [];
    w.__playAt = null;
    new MutationObserver(() => {
      const g = document.getElementById("gilded-gate");
      if (w.__playAt !== null || g?.getAttribute("data-state") !== "play") return;
      w.__playAt = performance.now();
      const loop = (ts: number): void => {
        w.__frames.push(ts);
        if (ts - (w.__playAt ?? 0) < 1300) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
  }, tier);
  await throttleCpu(p, test.info());
  await p.goto(`/s/${shopCode}?src=qr`);
  await p.waitForTimeout(2500);
  const { frames, playAt, lite } = await p.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __playAt: number | null };
    return {
      frames: w.__frames,
      playAt: w.__playAt ?? 0,
      lite: document.documentElement.classList.contains("lite"),
    };
  });
  await p.close();
  expect(lite).toBe(tier === "lite");
  const inside = frames.filter((t) => t >= playAt + 300 && t <= playAt + 1250);
  const gaps = inside.slice(1).map((t, i) => t - (inside[i] ?? t));
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? Infinity;
  const span = (inside.at(-1) ?? 0) - (inside[0] ?? 0);
  return { fps: span > 0 ? (gaps.length * 1000) / span : 0, p95, frames: inside.length };
}

for (const [tier, bound] of [
  ["lite", 16.8],
  ["full", 20],
] as const) {
  test(`[PD-09] convergence at 4× CPU: p95 ≤ ${String(bound)} ms on the ${tier} tier @fps`, async ({
    page,
    request,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
    const { shopCode } = await seedShop(request);
    const m = await medianFrameRate(test.info(), () => convergeRun(page, shopCode, tier));
    for (const r of m.runs) expect(r.frames).toBeGreaterThan(20);
    expect(m.p95).toBeLessThanOrEqual(bound);
  });
}
