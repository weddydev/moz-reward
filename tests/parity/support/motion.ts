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
   * Values set on the target (an input) one after another, each with the native setter and an `input` event,
   * before `events`: a drag's steps at one instant (the slider: a step, then a jump, so the bubble leans to its
   * ±28° cap on both pages whatever time has passed since load).
   */
  values?: readonly string[];
  /**
   * Page-clock time to run after the events, for a part whose motion starts on timers (the stars ignite 70 ms
   * apart); then the harness waits for `until` (a selector) and pauses every animation again.
   */
  runFor?: number;
  until?: string;
  /**
   * Frames captured at these ms after the trigger (every animation set to that time) instead of fractions of
   * each animation's own length: for a moment whose animations have different lengths and delays that must line
   * up (the gold wipe: 0, 260, 620 and 730 ms, PD-08).
   */
  atMs?: readonly number[];
  /**
   * The curve spec compares elements in document order; a part whose app markup can't keep the reference's
   * element structure (the shop view: `next/image`, the cover's text wrapper, the molten button's label spans)
   * skips it, and its motion is judged by the `atMs` frames instead (DECISIONS 23 Nov "PD-08 wipe parity").
   */
  curves?: false;
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
  // A drag from 240 to 480: the bubble leans back to −28° (and the Coffee notch sparks; sparks are FX).
  slider: { target: "input", values: ["250", "480"], events: [] },
  // A tap: the card turns over to the QR side (.7 s spring).
  "member-card": { events: ["click"] },
  // Offers in the dock: the gold pours one column right (the liquid choice's pour, beats included).
  dock: { target: "[data-liq]:nth-of-type(2)", events: ["click"], beats: [0.42, 0.76] },
  // A tap on the Brew & Bloom card: the gold wipe into its shop (both pages mark the cards `data-id`).
  shop: {
    from: '[data-id="brew"]',
    events: ["click"],
    waitFor: '[data-parity="shop"]:not([hidden])',
    atMs: [0, 260, 620, 730],
    curves: false,
  },
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
      if (t.values) {
        // The prototype's setter: React tracks values set on the element itself and would ignore them.
        for (const v of t.values) {
          Reflect.set(HTMLInputElement.prototype, "value", v, el);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
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
  await tagAnimations(page);
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

/**
 * Timer-driven moments (the Gilded Gate intro, PD-09). The reference starts each beat with a timer and
 * `el.animate()`; the app starts them all at once with delays. Under the paused page clock both are run to the
 * same instant (`page.clock.runFor`: timers and the canvas's rAF frames), then every animation is paused and set
 * to its own age: now minus when it was created (`tagAnimations` stamps that), or minus the trigger for one
 * that wasn't created by `animate()` (CSS). So a beat the reference creates at 1250 ms lines up with the app's
 * delay of 1250 ms.
 */
export async function tagAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Animate = (this: Element, ...args: Parameters<Element["animate"]>) => Animation;
    const animate: Animate = Reflect.get(Element.prototype, "animate");
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element["animate"]>
    ): Animation {
      const a = animate.apply(this, args);
      Reflect.set(a, "__born", performance.now());
      return a;
    };
  });
}

/** The same seeded `Math.random` as `seedRandom`, restarted (both pages then draw the same particles). */
export async function reseed(page: Page, seed = 1): Promise<void> {
  await page.evaluate((s) => {
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

/** Clicks `target` inside `part` (dispatched, as `fire`) and notes the page-clock time as the trigger. */
export async function fireTimed(page: Page, part: string, target: string): Promise<void> {
  await page.evaluate(
    ({ name, sel }) => {
      const el = document.querySelector(`[data-parity="${name}"]`)?.querySelector(sel);
      if (!el) throw new Error(`trigger target missing: ${name} ${sel}`);
      const r = el.getBoundingClientRect();
      Reflect.set(window, "__trigger", performance.now());
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        }),
      );
    },
    { name: part, sel: target },
  );
}

/**
 * Pauses every animation at its own age (see `tagAnimations`); "rest" sends finite ones to their end. The paused
 * ones are kept in `window.__frozen` (see `frozenAnimations`): one paused at its end with `fill: none` is neither
 * current nor in effect, so `document.getAnimations()` no longer lists it and only that list can resume it.
 */
export async function freezeTimed(page: Page, rest = false): Promise<void> {
  await page.evaluate((toEnd) => {
    void document.documentElement.getBoundingClientRect();
    const trigger = Number(Reflect.get(window, "__trigger") ?? 0);
    const now = performance.now();
    const frozen: Animation[] = [];
    Reflect.set(window, "__frozen", frozen);
    for (const a of document.getAnimations()) {
      if (a.timeline !== document.timeline) {
        a.cancel();
        continue;
      }
      a.pause();
      frozen.push(a);
      const end = a.effect?.getComputedTiming().endTime;
      const finite = typeof end === "number" && Number.isFinite(end);
      if (toEnd) {
        a.currentTime = finite ? end : 0;
        continue;
      }
      const born: unknown = Reflect.get(a, "__born");
      a.currentTime = Math.max(0, now - (typeof born === "number" ? born : trigger));
    }
    for (const c of document.querySelectorAll<HTMLCanvasElement>("canvas#fx, canvas[data-fx]"))
      c.style.visibility = "hidden";
  }, rest);
}

/**
 * The intro at rest for the static spec: once it has played (its canvas was sized for a run), a tap on the stage
 * skips it to the rest frame on both pages.
 */
export async function settleIntro(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const cv = document.querySelector('[data-parity="intro"] canvas');
    return cv instanceof HTMLCanvasElement && cv.width !== 300;
  });
  await page.evaluate(() => {
    const stage = document.querySelector('[data-parity="intro"] > div');
    stage?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
  });
}
