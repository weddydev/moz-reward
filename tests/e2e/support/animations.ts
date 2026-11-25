/**
 * One recorder for every motion spec (P1-19; TESTING §7 "Motion specs assert the animation, not drawn frames").
 *
 * A motion spec proves what the code *started* (keyframes, duration, delay, easing, fill) and where it *ended*,
 * never that a frame was drawn: Linux WebKit on CI may draw no frame for a second after a load (KI-10, KI-59).
 * The recorder sees every animation from the page's first script on:
 * - script animations: `Element.prototype.animate` is wrapped in an init script, so one started during parse
 *   or hydration is caught, and so is one that lasts 0 ms (reduced motion: "none started" stays provable);
 * - CSS animations and transitions: swept from `document.getAnimations()` on `animationstart` / `transitionrun`
 *   and on every read;
 * - a cancelled animation stays in the list as started, with state `cancelled` (`Animation.prototype.cancel`
 *   is wrapped, so the flag is set at once, not on the next frame's event); `finish()` is wrapped the same way
 *   (`finishCalled`: cut short by the page, not left to end on its own).
 *
 * Unit test: tests/support/e2e-animations.test.ts (outside tests/e2e, which Playwright collects `*.test.ts` from).
 * Usage: `await recordAnimations(page)` before `goto`, then `await started(page, ".m-bubble")`.
 */
import type { Locator, Page } from "@playwright/test";

export type Keyframe = Record<string, string | number | null>;

export type Timing = {
  duration: number;
  delay: number;
  endDelay: number;
  easing: string;
  fill: string;
  iterations: number;
  direction: string;
};

export type StartedAnimation = {
  /** Order of discovery (script animations: order of the `animate()` calls). */
  seq: number;
  source: "script" | "css-animation" | "css-transition";
  /** `animationName`, `transitionProperty` or the script animation's `id`. */
  name: string;
  /** Short label of the target for messages: `tag#id.class1.class2`. */
  target: string;
  /** The target's `data-*` attributes (`dataset`), e.g. `{ ingotPart: "fill" }`. */
  data: Record<string, string>;
  keyframes: Keyframe[];
  timing: Timing;
  /** `performance.now()` when it was seen. */
  startedAt: number;
  state: "running" | "paused" | "finished" | "cancelled";
  /** The page called `finish()` on it (cut short to its end, not left to end on its own). */
  finishCalled: boolean;
};

type EffectLike = { getKeyframes?: () => object[]; getTiming?: () => object } | null | undefined;

/**
 * Plain, serialisable keyframes and timing from an effect (`KeyframeEffect`), the same shape on every engine.
 * Self-contained: it runs in the page (injected by source text) and in the unit test.
 */
export function snapshotEffect(effect: EffectLike): { keyframes: Keyframe[]; timing: Timing } {
  const keyframes: Keyframe[] = [];
  const raw = effect?.getKeyframes ? effect.getKeyframes() : [];
  for (const k of raw) {
    const out: Keyframe = {};
    for (const [prop, value] of Object.entries(k as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number" || value === null)
        out[prop] = value;
    }
    keyframes.push(out);
  }
  const t = (effect?.getTiming ? effect.getTiming() : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && !Number.isNaN(v) ? v : fallback;
  const str = (v: unknown, fallback: string): string =>
    typeof v === "string" && v !== "" ? v : fallback;
  return {
    keyframes,
    timing: {
      // "auto" (a script animation given no duration) is 0 ms (Web Animations §4.5.4).
      duration: num(t.duration, 0),
      delay: num(t.delay, 0),
      endDelay: num(t.endDelay, 0),
      easing: str(t.easing, "linear"),
      fill: str(t.fill, "auto"),
      iterations: num(t.iterations, 1),
      direction: str(t.direction, "normal"),
    },
  };
}

/** Installs the recorder in the page (idempotent). Self-contained: injected by source text. */
function installRecorder(snapshot: typeof snapshotEffect): void {
  type Rec = {
    a: Animation;
    seq: number;
    source: StartedAnimation["source"];
    at: number;
    cancelled: boolean;
    finishCalled: boolean;
  };
  const w = window as unknown as {
    __animRec?: {
      read: (selector: string | null) => StartedAnimation[];
      clear: () => void;
      sweep: () => void;
      hold: (h: { within: string; path: string } | null) => void;
      held: () => number;
      release: () => void;
    };
  };
  if (w.__animRec) return;
  const list: Rec[] = [];
  let byAnim = new WeakMap<Animation, Rec>();
  let hold: { within: string; path: string } | null = null;
  const held: Animation[] = [];
  // Animations that existed at the last clear: not "started since", unless the page cancels or finishes one.
  let ignored = new WeakSet<Animation>();
  const add = (a: Animation, source: Rec["source"], explicit = false): void => {
    if (byAnim.has(a) || (!explicit && ignored.has(a))) return;
    const rec: Rec = {
      a,
      seq: list.length,
      source,
      at: performance.now(),
      cancelled: false,
      finishCalled: false,
    };
    byAnim.set(a, rec);
    list.push(rec);
    const target = (a.effect as KeyframeEffect | null)?.target;
    if (
      hold &&
      location.pathname === hold.path &&
      target instanceof Element &&
      target.closest(hold.within) &&
      a.effect?.getTiming().iterations !== Infinity
    ) {
      a.pause();
      held.push(a);
    }
  };
  const sourceOf = (a: Animation): Rec["source"] =>
    "animationName" in a
      ? "css-animation"
      : "transitionProperty" in a
        ? "css-transition"
        : "script";
  const sweep = (): void => {
    if (typeof document.getAnimations !== "function") return;
    for (const a of document.getAnimations()) add(a, sourceOf(a));
  };
  const animate = Object.getOwnPropertyDescriptor(Element.prototype, "animate")?.value as
    Element["animate"] | undefined;
  if (animate) {
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const a = animate.apply(this, args);
      add(a, "script");
      return a;
    };
  }
  const cancel = Object.getOwnPropertyDescriptor(Animation.prototype, "cancel")?.value as
    Animation["cancel"] | undefined;
  if (cancel) {
    Animation.prototype.cancel = function (this: Animation) {
      add(this, sourceOf(this), true);
      const rec = byAnim.get(this);
      if (rec) rec.cancelled = true;
      cancel.call(this);
    };
  }
  const finish = Object.getOwnPropertyDescriptor(Animation.prototype, "finish")?.value as
    Animation["finish"] | undefined;
  if (finish) {
    Animation.prototype.finish = function (this: Animation) {
      add(this, sourceOf(this), true);
      const rec = byAnim.get(this);
      if (rec) rec.finishCalled = true;
      finish.call(this);
    };
  }
  window.addEventListener("animationstart", sweep, true);
  window.addEventListener("transitionrun", sweep, true);
  const label = (el: Element | null): string => {
    if (!el) return "(no target)";
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className.trim() !== "" ? el.className.trim() : "";
    return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls.split(/\s+/).join(".")}` : ""}`;
  };
  w.__animRec = {
    read(selector) {
      sweep();
      const out: StartedAnimation[] = [];
      for (const r of list) {
        const effect = r.a.effect as KeyframeEffect | null;
        const el = effect?.target ?? null;
        if (selector !== null && !(el instanceof Element && el.matches(selector))) continue;
        const a = r.a as Animation & { animationName?: string; transitionProperty?: string };
        const play = a.playState;
        out.push({
          seq: r.seq,
          source: r.source,
          name: a.animationName ?? a.transitionProperty ?? a.id,
          target: label(el),
          data:
            el instanceof HTMLElement || el instanceof SVGElement
              ? Object.fromEntries(
                  Object.entries(el.dataset).filter(
                    (e): e is [string, string] => e[1] !== undefined,
                  ),
                )
              : {},
          ...snapshot(effect),
          startedAt: r.at,
          finishCalled: r.finishCalled,
          state:
            r.cancelled || play === "idle"
              ? "cancelled"
              : play === "finished"
                ? "finished"
                : play === "paused"
                  ? "paused"
                  : "running",
        });
      }
      return out;
    },
    clear() {
      // Forgotten: what exists now isn't "started since"; one the page later cancels or finishes is listed again.
      ignored = new WeakSet(
        typeof document.getAnimations === "function" ? document.getAnimations() : [],
      );
      for (const r of list) ignored.add(r.a);
      list.length = 0;
      byAnim = new WeakMap();
    },
    sweep,
    hold(h) {
      hold = h;
    },
    held: () => held.length,
    release() {
      hold = null;
      for (const a of held.splice(0)) if (a.playState === "paused") a.play();
    },
  };
}

const recorderSource = `(${installRecorder.toString()})(${snapshotEffect.toString()});`;

/**
 * Records every animation the page starts from now on, in this page and every page it loads next. Call it
 * before `goto` so animations started during parse and hydration are seen; on a loaded page it starts now.
 */
export async function recordAnimations(page: Page): Promise<void> {
  await page.addInitScript({ content: recorderSource });
  await page.evaluate(recorderSource);
}

/** Animations started on elements matching `selector` (all when omitted), oldest first. */
export function started(page: Page, selector?: string): Promise<StartedAnimation[]> {
  return page.evaluate((sel) => {
    const rec = (
      window as unknown as { __animRec?: { read: (s: string | null) => StartedAnimation[] } }
    ).__animRec;
    if (!rec) throw new Error("recordAnimations(page) was not called before this page loaded");
    return rec.read(sel);
  }, selector ?? null);
}

/**
 * Forgets the animations recorded so far, and every animation running now: a spec's next step then reads only
 * the ones started after this, plus any running one the page cancels or `finish()`es after this.
 */
export function clearAnimations(page: Page): Promise<void> {
  return page.evaluate(() => {
    (window as unknown as { __animRec?: { clear: () => void } }).__animRec?.clear();
  });
}

/**
 * Records the CSS transitions a style or class write on `target` starts, at the write: `getAnimations()` flushes
 * style, so the transition exists even if the page never draws a frame before the next write replaces it (a
 * starved Linux WebKit, KI-10). Without this, a transition replaced before any frame is never seen.
 * Caution: the flush comes between writes the page makes in separate tasks or microtasks, so a transition can
 * then start from an in-between style the browser would have skipped (the member card's `--rx` written before
 * React drops `.live`). Use it only while the writes it watches are the motion under test, and stop it (the
 * returned function) before steps where the page changes a style and a class apart.
 */
export async function sweepOnStyleWrites(target: Locator): Promise<() => Promise<void>> {
  await target.evaluate((el) => {
    const rec = (window as unknown as { __animRec?: { sweep: () => void } }).__animRec;
    if (!rec) throw new Error("recordAnimations(page) was not called before this page loaded");
    const obs = new MutationObserver(() => {
      rec.sweep();
    });
    obs.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
    (el as Element & { __sweepObs?: MutationObserver }).__sweepObs = obs;
  });
  return async () => {
    await target.evaluate((el) => {
      (el as Element & { __sweepObs?: MutationObserver }).__sweepObs?.disconnect();
    });
  };
}

type Holder = {
  hold: (h: { within: string; path: string } | null) => void;
  held: () => number;
  release: () => void;
};
const holder = (): Holder => {
  const rec = (window as unknown as { __animRec?: Holder }).__animRec;
  if (!rec) throw new Error("recordAnimations(page) was not called before this page loaded");
  return rec;
};

/**
 * From now on, every finite animation started inside `within` while the page is on `path` is paused at its
 * `animate()` call (or, for CSS, when swept), whatever the machine's speed: a test can then act "mid-animation"
 * for sure, without racing frames. `heldCount` says how many; `releaseHeld` plays them on and stops holding.
 */
export async function holdAnimations(page: Page, within: string, path: string): Promise<void> {
  await page.evaluate(`(${holder.toString()})().hold(${JSON.stringify({ within, path })})`);
}
export function heldCount(page: Page): Promise<number> {
  return page.evaluate(`(${holder.toString()})().held()`);
}
export async function releaseHeld(page: Page): Promise<void> {
  await page.evaluate(`(${holder.toString()})().release()`);
}

/** When the animation ends on its own timeline, in ms: delay + duration × iterations + end delay. */
export function endTime(a: StartedAnimation): number {
  return a.timing.delay + a.timing.duration * a.timing.iterations + a.timing.endDelay;
}

/** Does the animation change `prop` (a camelCase keyframe property, e.g. `transform`, `clipPath`)? */
export function animates(a: StartedAnimation, prop: string): boolean {
  const values = a.keyframes.map((k) => k[prop]).filter((v) => v !== undefined);
  return values.length > 0;
}

/** The value of `prop` in the first / last keyframe that sets it. */
export function fromValue(a: StartedAnimation, prop: string): string | number | null | undefined {
  return a.keyframes.find((k) => k[prop] !== undefined)?.[prop];
}
export function toValue(a: StartedAnimation, prop: string): string | number | null | undefined {
  return [...a.keyframes].reverse().find((k) => k[prop] !== undefined)?.[prop];
}

/** Does the animation move or scale its target (a `transform`, `translate`, `scale` or `rotate` that isn't `none`)? */
export function moves(a: StartedAnimation): boolean {
  return a.keyframes.some((k) =>
    ["transform", "translate", "scale", "rotate"].some(
      (p) => typeof k[p] === "string" && k[p] !== "none" && k[p] !== "",
    ),
  );
}

const FN = /([a-zA-Z0-9]+)\(([^)]*)\)/g;
/** Each `fn(a, b, …)` of a transform list; a missing argument reads as NaN, never as 0. */
const parts = (transform: string): { fn: string; arg: (i: number) => number }[] =>
  [...transform.matchAll(FN)].map((m) => {
    const args = (m[2] ?? "").split(",").map((v) => Number.parseFloat(v.trim()));
    return { fn: m[1] ?? "", arg: (i: number) => args[i] ?? Number.NaN };
  });

/**
 * The scale a transform sets along x, across a whole list (`translateY(8px) scale(.9)` → 0.9): the product of
 * every `scale` / `scale3d` / `scaleX` part, or the first column's length of a `matrix` / `matrix3d`. A bare
 * `scale` property value ("0.9" or "0.9 1") reads too. 1 for `none` or a list without scale; NaN when unreadable.
 */
export function scaleOf(transform: string | number | null | undefined): number {
  if (transform === null || transform === undefined || transform === "" || transform === "none")
    return 1;
  if (typeof transform === "number") return transform;
  const s = transform.trim();
  if (/^[-+.\d]/.test(s)) return Number.parseFloat(s);
  let scale = 1;
  for (const { fn, arg } of parts(s)) {
    if (fn === "matrix" || fn === "matrix3d") scale *= Math.hypot(arg(0), arg(1));
    else if (fn === "scale" || fn === "scale3d" || fn === "scaleX") scale *= arg(0);
  }
  return scale;
}

/** The x/y translation (px) a transform list sets: the sum of its `translate*` parts, or a `matrix`'s e/f. */
export function translateOf(transform: string | null | undefined): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (!transform || transform === "none") return { x, y };
  for (const { fn, arg } of parts(transform)) {
    if (fn === "translate" || fn === "translate3d") {
      x += arg(0);
      y += Number.isNaN(arg(1)) ? 0 : arg(1);
    } else if (fn === "translateX") x += arg(0);
    else if (fn === "translateY") y += arg(0);
    else if (fn === "matrix") {
      x += arg(4);
      y += arg(5);
    } else if (fn === "matrix3d") {
      x += arg(12);
      y += arg(13);
    }
  }
  return { x, y };
}

/**
 * The rotation (degrees, about z) a transform list sets: the sum of its `rotate` / `rotateZ` parts (deg, rad or
 * turn), or `atan2(b, a)` of a `matrix` / `matrix3d`.
 */
export function rotationOf(transform: string | null | undefined): number {
  if (!transform || transform === "none") return 0;
  let deg = 0;
  for (const m of transform.matchAll(FN)) {
    const fn = m[1] ?? "";
    const raw = (m[2] ?? "").split(",").map((v) => v.trim());
    const first = raw[0] ?? "";
    if (fn === "rotate" || fn === "rotateZ") {
      const v = Number.parseFloat(first);
      deg += first.endsWith("rad") ? (v * 180) / Math.PI : first.endsWith("turn") ? v * 360 : v;
    } else if (fn === "matrix" || fn === "matrix3d") {
      deg += (Math.atan2(Number(raw[1]), Number(first)) * 180) / Math.PI;
    }
  }
  return deg;
}

/** One line per animation, for assertion messages. */
export function describeAnimations(list: StartedAnimation[]): string {
  return list
    .map(
      (a) =>
        `${a.source} ${a.name || "(anon)"} on ${a.target}: ${String(a.timing.duration)} ms +${String(a.timing.delay)} ` +
        `${a.timing.easing} fill ${a.timing.fill} [${a.state}] ${JSON.stringify(a.keyframes.map((k) => ({ ...k, computedOffset: undefined })))}`,
    )
    .join("\n");
}
