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
export type Trigger = {
  target?: string;
  /** A selector in the whole document, for a part set moving by another element (the toast, by the button). */
  from?: string;
  events: readonly string[];
  /** A part that appears later (React renders the toast after the click): wait for it, then pause again. */
  waitFor?: string;
  /** Named beats captured besides 0/25/50/75/100% (the liquid pour's stretch at 42% and overshoot at 76%). */
  beats?: readonly number[];
  /**
   * Focus the target after the events (a text field's beam runs on focus). Focus rings (outline and halo) are
   * hidden on both pages for that capture, the target keeping its unfocused shadow: the app keeps DESIGN §13's
   * ring on its field, the reference draws none, and a ring is not motion (DECISIONS 23 Nov "PD-06 field focus ring").
   */
  focus?: true;
  /**
   * Page-clock time to run after the events, for a part whose motion starts on timers (the stars ignite 70 ms
   * apart); then the harness waits for `until` (a selector) and pauses every animation again.
   */
  runFor?: number;
  until?: string;
};

/** Triggers by part name. Each PD task adds the triggers of the parts it builds. Hover-driven rows (orbit and
 *  ghost buttons, PD-04) use `pointerover`/`pointerenter`-style events here too. */
export const TRIGGERS: Record<string, Trigger> = {
  "heart-toggle": { events: ["click"] },
  "coin-switch": { events: ["click"] },
  // The second option (Cake): the gold pours one slot right.
  "liquid-choice": {
    target: '[role="radio"]:nth-of-type(2)',
    events: ["click"],
    beats: [0.42, 0.76],
  },
  // A click on the box goes to its <label>, which toggles the checkbox (the first unticks, the second ticks).
  "seal-checkbox": { events: ["click"] },
  "seal-checkbox-on": { events: ["click"] },
  "molten-button": { events: ["pointerdown", "pointerup", "click"] },
  toast: {
    from: '[data-parity="molten-button"]',
    events: ["pointerdown", "pointerup", "click"],
    waitFor: '[data-parity="toast"] > *',
  },
  tabs: { target: '[role="tab"]:nth-of-type(2)', events: ["click"] },
  // Three stars: they ignite 70 ms apart (page-clock timers, run on both pages), the word rises in and the two
  // equal choices pop in.
  stars: {
    target: '[role="radio"]:nth-of-type(3)',
    events: ["click"],
    runFor: 150,
    until: '[data-parity="stars"] > .lit:nth-of-type(3)',
  },
  // A tap in the middle of the field: the beam runs out from the centre, the label floats.
  "text-field": { target: "input", events: ["pointerdown"], focus: true },
};

/** Fires a part's trigger and pauses every time-based animation at once (see `Trigger`). */
export async function fire(page: Page, part: string): Promise<void> {
  const trigger = TRIGGERS[part];
  if (!trigger) throw new Error(`no trigger for ${part}`);
  await page.evaluate(
    ({ name, t }) => {
      const root = document.querySelector(`[data-parity="${name}"]`);
      const el = t.from
        ? document.querySelector(t.from)
        : t.target
          ? root?.querySelector(t.target)
          : root;
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
      if (t.focus) {
        const style = document.createElement("style");
        style.textContent = ":focus-visible{outline:none!important}";
        document.head.append(style);
        // The ring's halo is a box-shadow: keep the target's unfocused shadow (the field's underline) instead.
        const html = el as HTMLElement;
        html.style.setProperty("box-shadow", getComputedStyle(html).boxShadow, "important");
        html.focus();
      }
      void document.documentElement.getBoundingClientRect(); // style now, so new transitions exist
      for (const a of document.getAnimations()) if (a.timeline === document.timeline) a.pause();
    },
    { name: part, t: trigger },
  );
  if (trigger.runFor !== undefined) await page.clock.runFor(trigger.runFor);
  const settle = trigger.waitFor ?? trigger.until;
  if (settle) {
    // Polled from the test: under the paused page clock in-page polling never runs.
    const deadline = Date.now() + 5_000;
    while (!(await page.evaluate((sel) => document.querySelector(sel) !== null, settle))) {
      if (Date.now() > deadline) throw new Error(`${part} never appeared (${settle})`);
      await new Promise((r) => setTimeout(r, 50));
    }
    await page.evaluate(() => {
      void document.documentElement.getBoundingClientRect();
      for (const a of document.getAnimations()) if (a.timeline === document.timeline) a.pause();
    });
  }
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
  // The app's streamed content sits in a hidden boundary until React reveals it on a timer (PD-04: the first app
  // part under this clock measured 0 × 0). One second of page time, the same on both pages, lets it in.
  await page.clock.runFor(1_000);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-parity]")].some(
      (e) => e.getBoundingClientRect().width > 0,
    ),
  );
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
  return part.evaluate((root) => {
    const ancestorsUpTo = (el: Element, top: Element): Element[] => {
      const out: Element[] = [];
      for (let a = el.parentElement; a && a !== top; a = a.parentElement) out.push(a);
      return out;
    };
    return (
      [root, ...root.querySelectorAll("*")]
        // SVG paint servers (a gradient in <defs>, and an svg that holds only defs) never render or move: where a
        // part keeps them is not motion (PD-04: the heart's per-button metal gradient; the reference's is global).
        .filter(
          (el) =>
            !el.closest("defs") &&
            // Visually hidden content (the 1 px clip pattern, e.g. the toast's Dismiss until it is focused) never
            // moves on screen. 1.5, not 1: a 1 px box measures a hair over 1 once transforms have run.
            ![...[el, ...ancestorsUpTo(el, root)]].some((a) => {
              const r = a.getBoundingClientRect();
              return r.width <= 1.5 && r.height <= 1.5;
            }) &&
            !(
              el.tagName.toLowerCase() === "svg" &&
              [...el.children].every((c) => c.tagName.toLowerCase() === "defs")
            ),
        )
        .map((el) => {
          const cs = getComputedStyle(el);
          const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
          return { x: m.e, y: m.f, scale: Math.hypot(m.a, m.b), opacity: Number(cs.opacity) };
        })
    );
  });
}
