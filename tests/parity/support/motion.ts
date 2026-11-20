import { type Locator, type Page } from "@playwright/test";
import { instantScroll, REFERENCE_PATH, seedRandom, serveReference } from "./reference";

/**
 * Deterministic motion capture for the frame and curve specs (PD-01). The page clock is installed before load
 * and never runs on its own, so timers and rAF (the FX loop, delayed sparks) only move when a test says; right
 * after a trigger every animation (CSS and WAAPI) is paused and then seeked, so the same instant is captured on
 * both pages whatever the machine's speed.
 */

/**
 * How a part is set moving, the same on the reference and on `/dev/molten`: `events` are dispatched in order at
 * the centre of `target` (a selector inside the part; the part itself when omitted), and every animation is
 * paused in the same page evaluation. Two things this avoids (20 Nov): a real Playwright click hovers first and
 * :hover transitions then run in real time; and any gap between the event and the pause lets short transitions
 * (0.3 s label colours) finish and vanish from `getAnimations()` on a loaded machine.
 */
export type Trigger = { target?: string; events: readonly string[] };

/** Triggers by part name. Each PD task adds the triggers of the parts it builds. Hover-driven rows (orbit and
 *  ghost buttons, PD-04) use `pointerover`/`pointerenter`-style events here too. */
export const TRIGGERS: Record<string, Trigger> = {
  "heart-toggle": { events: ["click"] },
  "coin-switch": { events: ["click"] },
  "molten-button": { events: ["pointerdown", "pointerup", "click"] },
  tabs: { target: '[role="tab"]:nth-of-type(2)', events: ["click"] },
};

/** Fires a part's trigger and pauses every time-based animation at once (see `Trigger`). */
export async function fire(page: Page, part: string): Promise<void> {
  const trigger = TRIGGERS[part];
  if (!trigger) throw new Error(`no trigger for ${part}`);
  await page.evaluate(
    ({ name, t }) => {
      const root = document.querySelector(`[data-parity="${name}"]`);
      const el = t.target ? root?.querySelector(t.target) : root;
      if (!el) throw new Error(`trigger target missing: ${name} ${t.target ?? ""}`);
      const r = el.getBoundingClientRect();
      const at = {
        bubbles: true,
        cancelable: true,
        clientX: r.x + r.width / 2,
        clientY: r.y + r.height / 2,
      };
      for (const type of t.events) {
        el.dispatchEvent(
          type.startsWith("pointer")
            ? new PointerEvent(type, { ...at, pointerId: 1, pointerType: "mouse", isPrimary: true })
            : new MouseEvent(type, at),
        );
      }
      void document.documentElement.getBoundingClientRect(); // style now, so new transitions exist
      for (const a of document.getAnimations()) if (a.timeline === document.timeline) a.pause();
    },
    { name: part, t: trigger },
  );
}

export async function openForMotion(
  page: Page,
  url: string,
  width: number,
  height: number,
): Promise<void> {
  await serveReference(page);
  // A fixed start, paused a second later: timers and rAF move only when a test says.
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:00:01Z"));
  await seedRandom(page);
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await instantScroll(page);
  await page.evaluate(() => document.fonts.ready);
}

export const referenceUrl = REFERENCE_PATH;

/** Pauses every animation; finite ones go to `fraction` of their end, endless ones (idle loops) to their start.
 *  Scroll-driven ones go to their end state (they can't be seeked in ms; see `freezeAt`). */
export async function seekFraction(page: Page, fraction: number): Promise<void> {
  await page.evaluate((f) => {
    // Style first, so transitions the trigger started exist before they are paused and seeked.
    void document.documentElement.getBoundingClientRect();
    for (const a of document.getAnimations()) {
      if (a.timeline !== document.timeline) {
        a.cancel();
        continue;
      }
      a.pause();
      const end = a.effect?.getComputedTiming().endTime;
      a.currentTime = typeof end === "number" && Number.isFinite(end) ? end * f : 0;
    }
    for (const c of document.querySelectorAll<HTMLCanvasElement>("canvas#fx, canvas[data-fx]"))
      c.style.visibility = "hidden";
  }, fraction);
}

/** Longest the curves are sampled for, whatever a part's animations say. */
const CURVE_CAP_MS = 5_000;

/**
 * Pauses every animation and sets them all to `ms` (clamped to each one's end). Returns the longest finite end
 * among the animations inside `part` (capped), which is how long that part's interaction lasts.
 */
export async function seekMs(page: Page, part: string, ms: number): Promise<number> {
  return page.evaluate(
    ({ t, name, cap }) => {
      const root = document.querySelector(`[data-parity="${name}"]`);
      let longest = 0;
      // Style first, so transitions the trigger started exist before they are paused and seeked.
      void document.documentElement.getBoundingClientRect();
      for (const a of document.getAnimations()) {
        if (a.timeline !== document.timeline) {
          a.cancel();
          continue;
        }
        a.pause();
        const end = a.effect?.getComputedTiming().endTime;
        const finite = typeof end === "number" && Number.isFinite(end);
        const target = (a.effect as KeyframeEffect | null)?.target;
        if (finite && root && target && root.contains(target)) longest = Math.max(longest, end);
        a.currentTime = finite ? Math.min(t, end) : 0;
      }
      return Math.min(longest, cap);
    },
    { t: ms, name: part, cap: CURVE_CAP_MS },
  );
}

export type Sample = { x: number; y: number; scale: number; opacity: number };

/** Translate, scale and opacity of each element under `root` (root first, document order). */
export async function sampleCurves(part: Locator): Promise<Sample[]> {
  return part.evaluate((root) =>
    [root, ...root.querySelectorAll("*")].map((el) => {
      const cs = getComputedStyle(el);
      const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
      return { x: m.e, y: m.f, scale: Math.hypot(m.a, m.b), opacity: Number(cs.opacity) };
    }),
  );
}
