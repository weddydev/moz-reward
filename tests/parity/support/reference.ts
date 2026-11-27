import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type APIRequestContext, type Page, test } from "@playwright/test";
import { PARITY_PARTS } from "../../../src/features/dev/molten/parity-parts";

/**
 * Parity harness plumbing (PD-01). The reference copy (`tests/parity/reference/`, made from the frozen original
 * by `pnpm parity:reference`) is served on the app's own origin under `/__parity/reference/`, intercepted by
 * Playwright, never by the app: so both pages load the same self-hosted fonts with no network and no CORS, and
 * nothing test-only ships in the build. Google Fonts in the reference are replaced by the app's own
 * `@font-face` rules (same family names, `Fraunces` / `Manrope`).
 */
export const REFERENCE_PATH = "/__parity/reference/";
const DIR = path.resolve(__dirname, "../reference");
/** The photos come from the frozen original, so the copy holds only its HTML. */
const ORIGINAL = path.resolve(__dirname, "../../../design/reference/molten");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".css": "text/css; charset=utf-8",
};

/** The app's `@font-face` rules for Fraunces and Manrope, with absolute URLs (read once per worker). */
let fontsCss: Promise<string> | null = null;
async function appFonts(request: APIRequestContext): Promise<string> {
  fontsCss ??= (async () => {
    const html = await (await request.get("/dev/molten")).text();
    const sheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map(
      (m) => m[1] ?? "",
    );
    const faces: string[] = [];
    for (const href of sheets) {
      const css = await (await request.get(href)).text();
      for (const m of css.matchAll(/@font-face\{[^}]*\}/g)) {
        if (/font-family:\s*"?(Fraunces|Manrope)"?;/.test(m[0])) {
          faces.push(m[0].replace(/url\(\.\.\/media\//g, "url(/_next/static/media/"));
        }
      }
    }
    if (faces.length === 0)
      throw new Error("no Fraunces/Manrope @font-face found in the app's CSS");
    return faces.join("\n");
  })();
  return fontsCss;
}

/** Serves the reference copy at `/__parity/reference/` on this page's origin. */
/** Requests a parity page tried to send off this machine (refused); the self-tests assert there are none. */
export const offline = new WeakMap<Page, string[]>();

export async function serveReference(page: Page): Promise<void> {
  // Offline: anything not on the app's own origin is refused and recorded, never fetched.
  const tried: string[] = [];
  offline.set(page, tried);
  await page.route(
    (url) => url.hostname !== "localhost" && url.hostname !== "127.0.0.1",
    async (route) => {
      tried.push(route.request().url());
      await route.abort("blockedbyclient");
    },
  );
  // The app's cookie notice is page chrome, not a part: a stored choice keeps it away (as in the E2E suite).
  const origin = new URL(test.info().project.use.baseURL ?? "http://localhost:3100").origin;
  await page
    .context()
    .addCookies([
      { name: "moz_consent", value: "analytics-v1-denied", url: origin, sameSite: "Lax" },
    ]);
  // Fonts wait for the real faces on both pages: the app's italic is `font-display: optional` (DECISIONS 20 Nov),
  // which may keep the fallback on a cold load and make a capture depend on network timing. Parity runs only:
  // the app's stylesheets and the reference's fonts.css are served with `block` instead.
  const blockFonts = (css: string): string =>
    css.replace(/font-display:\s*(optional|swap)/g, "font-display:block");
  await page.route("**/_next/static/chunks/*.css", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: blockFonts(await res.text()) });
  });
  const fonts = blockFonts(await appFonts(page.request));
  await page.route(`**${REFERENCE_PATH}**`, async (route) => {
    const rel =
      decodeURIComponent(new URL(route.request().url()).pathname.slice(REFERENCE_PATH.length)) ||
      "index.html";
    if (rel === "fonts.css") {
      await route.fulfill({ body: fonts, contentType: "text/css; charset=utf-8" });
      return;
    }
    const base = rel.startsWith("img/") ? ORIGINAL : DIR;
    const file = path.resolve(base, rel);
    if (!file.startsWith(base + path.sep)) {
      await route.fulfill({ status: 404 });
      return;
    }
    try {
      await route.fulfill({
        body: readFileSync(file),
        contentType: TYPES[path.extname(file)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}

/** Seeds `Math.random` (mulberry32) before any page script, identically on both pages. */
export async function seedRandom(page: Page, seed = 1): Promise<void> {
  await page.addInitScript((s: number) => {
    let a = s >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

/** Instant scrolling on the page: smooth scrolling would keep elements moving while a capture waits. */
export async function instantScroll(page: Page): Promise<void> {
  await page.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
}

/**
 * Screenshot of a part, scrolled into view instantly and clipped from the page. No Playwright "stable" wait:
 * WebKit runs it on requestAnimationFrame, which a paused page clock never fires.
 */
export async function capture(page: Page, part: string): Promise<Buffer> {
  const spec = PARITY_PARTS.find((p) => p.name === part);
  const isolate = spec?.isolate === true;
  const ownHeight = spec?.ownHeight === true;
  const alone = spec?.alone === true;
  const box = await page.evaluate(
    ({ name, isolate, ownHeight, alone }) => {
      const el = document.querySelector(`[data-parity="${name}"]`);
      if (!el) throw new Error(`no [data-parity="${name}"] on the page`);
      // The reference page chrome (sticky top bar, toasts) belongs to no part and would overlap one.
      // (Unless the part is the toast stack itself, PD-04; the app's stack too, over the vault's reward, PD-10.)
      for (const c of document.querySelectorAll<HTMLElement>("body > .bar, .toasts, .m-toasts"))
        if (!c.contains(el)) c.style.visibility = "hidden";
      // Whole pixels on both pages: a part at a fractional page position rasterises its text and edges one device
      // pixel off, which reads as a mismatch everywhere (20 Nov, Language section). Nudge it onto the pixel grid
      // (position: relative, so no layer and no layout change) and scroll by whole pixels.
      // An isolated part (parity-parts `isolate`) is judged on white: its parent's background, on both pages.
      // The white runs 8 px past the parent's edges, so the pixel-grid nudge below can't lift the part's top
      // row off it (PD-04: a 1 px strip of page showed on the app only, where the part sat at a fractional y).
      if (isolate && el.parentElement) {
        el.parentElement.style.background = "#fff";
        el.parentElement.style.boxShadow = "0 0 0 8px #fff";
      }
      // An overlay judged alone (parity-parts `alone`): only the part shows, on white.
      if (alone && el instanceof HTMLElement) {
        document.documentElement.style.background = "#fff";
        document.body.style.background = "#fff";
        document.body.style.visibility = "hidden";
        el.style.visibility = "visible";
      }
      // A tile judged at its own height (parity-parts `ownHeight`): not stretched by a row-mate built later.
      if (ownHeight && el instanceof HTMLElement) el.style.alignSelf = "start";
      if (el instanceof HTMLElement && el.dataset.parityAligned === undefined) {
        const r0 = el.getBoundingClientRect();
        const fx = (r0.left + window.scrollX) % 1;
        const fy = (r0.top + window.scrollY) % 1;
        if (fx || fy) {
          const position = getComputedStyle(el).position;
          const frame = el.offsetParent;
          const framePos = frame instanceof HTMLElement ? getComputedStyle(frame).position : "";
          if (
            position === "absolute" &&
            frame instanceof HTMLElement &&
            (framePos === "relative" || framePos === "static")
          ) {
            // An inset-placed part (the dock: `bottom: 14px` in the phone's screen) can't take a `top` offset (it
            // would win over its `bottom`), and its text snaps to pixels in its frame's layer anyway (the screen:
            // overflow, radius, isolation). Snap the frame, which moves the part with it (PD-07).
            if (framePos === "static") frame.style.position = "relative";
            frame.style.left = `${String(-fx)}px`;
            frame.style.top = `${String(-fy)}px`;
          } else {
            if (position === "static") el.style.position = "relative";
            el.style.left = `${String(-fx)}px`;
            el.style.top = `${String(-fy)}px`;
          }
        }
        el.dataset.parityAligned = "";
      }
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      window.scrollTo(Math.round(window.scrollX), Math.round(window.scrollY));
      const r = el.getBoundingClientRect();
      // Whole CSS pixels for the size too: the reference's lab grid holds tiles later tasks build, so Chromium
      // gives its 1/64 px track remainders to other columns and a tile measures 594.984 on one page and 595 on
      // the other (PD-05). Unrounded, the clip then differs by a device pixel and the diff reads as 100%.
      return { x: r.x, y: r.y, width: Math.round(r.width), height: Math.round(r.height) };
    },
    { name: part, isolate, ownHeight, alone },
  );
  // A tile shrunk to its own height redraws its gilded edge from a ResizeObserver (the reference's `draw`, the
  // app's GildedEdge). Wait for that delivery: WebKit can otherwise take the shot first, and the old viewBox is
  // scaled into the shorter tile (PD-06: the Input tile's seam ran through its title in WebKit only). A
  // ResizeObserver observed now is notified in the same delivery, after the page's own, whatever the page clock.
  if (ownHeight)
    await page.evaluate(
      (name) =>
        new Promise<void>((done) => {
          const el = document.querySelector(`[data-parity="${name}"]`);
          if (!el) {
            done();
            return;
          }
          const ro = new ResizeObserver(() => {
            ro.disconnect();
            done();
          });
          ro.observe(el);
        }),
      part,
    );
  return page.screenshot({ clip: box, caret: "hide" });
}

/** Gilded edges draw after hydration on the app (React); waits until every one on the page has its paths. */
export async function edgesDrawn(page: Page): Promise<void> {
  // Polled from the test, not with waitForFunction: under a paused page clock its in-page polling never runs.
  const deadline = Date.now() + 10_000;
  for (;;) {
    const ok = await page.evaluate(() =>
      [...document.querySelectorAll("svg.m-seam, svg.seam")].every((s) => s.querySelector("path")),
    );
    if (ok) return;
    if (Date.now() > deadline) throw new Error("gilded edges never drew");
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Opens a parity page for a still capture: no page clock (the app streams its content in, which needs timers),
 * seeded randomness, instant scrolling, fonts loaded and every gilded edge drawn. The reference is served too.
 */
export async function openStill(
  page: Page,
  url: string,
  width: number,
  height: number,
): Promise<void> {
  await serveReference(page);
  await page.setViewportSize({ width, height });
  await seedRandom(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(url);
  await instantScroll(page);
  await page.evaluate(() => document.fonts.ready);
  await edgesDrawn(page);
  await photosLoaded(page);
}

/**
 * Every eager `<img>` has loaded and decoded: a still capture must not race the photos (C-91: as plain `<img>` from
 * `getImageProps` the covers painted after Linux CI's shot; nothing here waited for them). Polled, like
 * `edgesDrawn`. A photo that never loads fails here by name instead of as a pixel diff.
 */
export async function photosLoaded(page: Page): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const pending = await page.evaluate(async () => {
      const imgs = [...document.images].filter((i) => i.loading !== "lazy");
      await Promise.all(
        imgs.filter((i) => i.complete).map((i) => i.decode().catch(() => undefined)),
      );
      return imgs
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => i.currentSrc || i.src);
    });
    if (pending.length === 0) return;
    if (Date.now() > deadline) throw new Error(`photos never loaded: ${pending.join(", ")}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Writes both images of a mismatch next to the test's results and attaches them to the report. */
/**
 * H-49 side-by-side set (PD-11): with `PARITY_SET=1`, every compared pair (reference, app) is kept under
 * `.artifacts/parity-set/<browser>/` with a manifest line (name, diff ratio, limit), whatever the result, so the
 * human sign-off reviews exactly what the parity specs compared. A normal run writes nothing.
 */
export function keepForSet(
  name: string,
  a: Buffer,
  b: Buffer | undefined,
  ratio: number,
  max: number,
): void {
  if (process.env["PARITY_SET"] !== "1" || !b) return;
  const browser = test.info().project.name;
  const dir = path.join(".artifacts", "parity-set", browser);
  mkdirSync(dir, { recursive: true });
  const safe = name.replace(/[^\w.-]+/g, "_");
  writeFileSync(path.join(dir, `${safe}-ref.png`), a);
  writeFileSync(path.join(dir, `${safe}-app.png`), b);
  appendFileSync(
    path.join(dir, "manifest.jsonl"),
    `${JSON.stringify({ name: safe, title: test.info().title, ratio, max })}\n`,
  );
}

export async function attachPair(name: string, a: Buffer, b: Buffer | undefined): Promise<void> {
  const info = test.info();
  for (const [side, img] of [
    ["ref", a],
    ["app", b],
  ] as const) {
    if (!img) continue;
    const file = info.outputPath(`${name}-${side}.png`);
    writeFileSync(file, img);
    await info.attach(`${name}-${side}.png`, { path: file, contentType: "image/png" });
  }
}

/**
 * The gilded edge's 8 s cycle at `ms` on every card: the random phase pinned to 0 (`--sd`) on both pages, the
 * edge animations seeked to `ms`, everything else frozen as at rest.
 */
export async function edgeCycleAt(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => {
    for (const s of document.querySelectorAll<SVGElement>("svg.m-seam, svg.seam")) {
      s.style.setProperty("--sd", "0s");
    }
    void document.documentElement.getBoundingClientRect();
    for (const a of document.getAnimations()) {
      if (a.timeline !== document.timeline) {
        a.cancel();
        continue;
      }
      a.pause();
      const target = (a.effect as KeyframeEffect | null)?.target;
      const end = a.effect?.getComputedTiming().endTime;
      if (target instanceof Element && target.closest("svg.m-seam, svg.seam")) a.currentTime = t;
      else a.currentTime = typeof end === "number" && Number.isFinite(end) ? end : 0;
    }
  }, ms);
}

/** Pauses every animation (CSS and WAAPI, SVG included) at `ms` from its start, and hides the FX canvas. */
export async function freezeAt(page: Page, ms: number | "rest"): Promise<void> {
  await page.evaluate((t) => {
    // Style first, so transitions the trigger started exist before they are paused and seeked.
    void document.documentElement.getBoundingClientRect();
    for (const a of document.getAnimations()) {
      // Scroll-driven animations (ScrollTimeline/ViewTimeline) can't be seeked in ms: they go to their end
      // state (the element's own style), so a capture never depends on the scroll position.
      if (a.timeline !== document.timeline) {
        a.cancel();
        continue;
      }
      a.pause();
      if (t === "rest") {
        const end = a.effect?.getComputedTiming().endTime;
        a.currentTime = typeof end === "number" && Number.isFinite(end) ? end : 0;
      } else a.currentTime = t;
    }
    for (const c of document.querySelectorAll<HTMLCanvasElement>("canvas#fx, canvas[data-fx]"))
      c.style.visibility = "hidden";
  }, ms);
}
