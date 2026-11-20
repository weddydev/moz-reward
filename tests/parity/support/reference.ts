import { readFileSync } from "node:fs";
import path from "node:path";
import { type APIRequestContext, type Page } from "@playwright/test";

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
  const fonts = await appFonts(page.request);
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
  const box = await page.evaluate((name) => {
    const el = document.querySelector(`[data-parity="${name}"]`);
    if (!el) throw new Error(`no [data-parity="${name}"] on the page`);
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, part);
  return page.screenshot({ clip: box, caret: "hide" });
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
