import { anim, reducedMotionNow } from "./anim";
import { burst } from "./fx";
import {
  circleClip,
  clearWipe,
  type Point,
  remainingDelay,
  riseDelay,
  setWipe,
  setWipeBack,
  takeWipe,
  takeWipeBack,
  WIPE,
  wipePoint,
  wipeRadius,
} from "./wipe";

/**
 * The app's card → shop gold wipe (PD-08, DESIGN §7.3), the reference's phone script spread over a real
 * navigation. The tap starts it (`startWipe`): the metal circle grows over the content area from the tap on a
 * fixed stage (`WipeStage`, outside the page content, under the dock and rail), sparks fly at 80 ms and the
 * Wallet sinks. The shop page's content takes it when it commits (`openWipe`, from `RouteContent`): instead of
 * sliding it opens in the same circle 110 ms after the tap (later if the network was slower: the metal simply
 * holds), its `[data-rise]` parts rise and a `[data-wipe-bar]` fills. Back (`wipeBack`) closes a copy of the
 * shop onto the back button while the Wallet returns (`returnWipe`). Reduced motion: none of this; the normal
 * 150 ms fade runs. Nobody takes the wipe within `WIPE.ttlMs` (navigation failed or went elsewhere): the stage
 * fades away and the Wallet comes back.
 */

let stage: HTMLElement | null = null;
let sinking: Animation | null = null;
let abandonTimer: ReturnType<typeof setTimeout> | undefined;

export function registerWipeStage(el: HTMLElement | null): void {
  stage = el;
}

/** A plain left click (a modified one opens a new tab and plays nothing). */
export function isPlainClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return (
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented
  );
}

/** The stage covers the content area: below the header while it is on screen, right of the rail. */
export function stageBox(main: { top: number; left: number }): { top: number; left: number } {
  return { top: Math.max(0, Math.round(main.top)), left: Math.max(0, Math.round(main.left)) };
}

/** The content sinks about the viewport's upper third (the reference's `50% 30%` of the phone screen). */
export function sinkOrigin(
  content: { left: number; top: number },
  viewport: { width: number; height: number },
): string {
  const x = viewport.width / 2 - content.left;
  const y = viewport.height * 0.3 - content.top;
  return `${String(Math.round(x))}px ${String(Math.round(y))}px`;
}

const contentEl = (): HTMLElement | null => {
  const all = document.querySelectorAll<HTMLElement>("[data-route-content]");
  return all[all.length - 1] ?? null;
};
const metalEl = (): HTMLElement | null =>
  stage?.querySelector<HTMLElement>(":scope > .m-wipe") ?? null;
const viewport = (): { width: number; height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

function placeStage(s: HTMLElement): { top: number; left: number } {
  const main = document.getElementById("main")?.getBoundingClientRect();
  const box = stageBox(main ?? { top: 0, left: 0 });
  s.style.top = `${String(box.top)}px`;
  s.style.left = `${String(box.left)}px`;
  return box;
}

function hideStage(): void {
  if (!stage) return;
  for (const a of stage.getAnimations({ subtree: true })) a.cancel();
  stage.hidden = true;
  for (const c of stage.querySelectorAll(":scope > [data-wipe-clone]")) c.remove();
  const m = metalEl();
  if (m) m.hidden = false;
}

function unsink(content: HTMLElement | null): void {
  sinking?.cancel();
  sinking = null;
  if (content) {
    content.style.transformOrigin = "";
    content.inert = false;
  }
}

function abandon(): void {
  clearTimeout(abandonTimer);
  clearWipe();
  const content = contentEl();
  if (content) content.style.opacity = "";
  unsink(content);
  const s = stage;
  if (!s || s.hidden) return;
  const fade = anim(s, [{ opacity: 1 }, { opacity: 0 }], { duration: WIPE.reducedFadeMs });
  if (fade) fade.onfinish = hideStage;
  else hideStage();
}

/**
 * A page committed that no wipe was waiting for (a dock tab or browser back before the shop arrived, or back to
 * somewhere other than the Wallet): whatever is on screen of a wipe goes at once, the page un-sinks, nothing waits
 * for the 5 s timeout. Harmless when no wipe is running (`RouteContent` calls it on every other navigation).
 */
export function settleWipe(): void {
  abandon();
}

/**
 * The tap on a Wallet card (its click handler, before the link navigates). Returns whether the wipe started.
 */
export function startWipe(
  href: string,
  event: { clientX: number; clientY: number } | null,
  card: Element,
  now = performance.now(),
): boolean {
  const s = stage;
  const metal = metalEl();
  if (!s || !metal || reducedMotionNow()) return false;
  hideStage();
  const box = placeStage(s);
  const p: Point = wipePoint(event, card.getBoundingClientRect(), box);
  setWipe(href, { x: p.x + box.left, y: p.y + box.top }, now);
  s.style.opacity = "";
  s.hidden = false;
  const vp = viewport();
  const r = wipeRadius(vp.width, vp.height);
  anim(metal, [{ clipPath: circleClip(0, p.x, p.y) }, { clipPath: circleClip(r, p.x, p.y) }], {
    duration: WIPE.durationMs,
    easing: WIPE.easing,
  });
  const content = contentEl();
  unsink(content);
  if (content) {
    content.style.transformOrigin = sinkOrigin(content.getBoundingClientRect(), vp);
    sinking = anim(
      content,
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: `scale(${String(WIPE.walletScale)})`, opacity: WIPE.walletOpacity },
      ],
      { duration: WIPE.walletMs },
    );
    // Under the metal the Wallet is invisible: a tap on the gold must not reach its cards (the reference's `open`
    // guard). The dock and rail stay live.
    content.inert = true;
  }
  const at = { x: p.x + box.left, y: p.y + box.top };
  setTimeout(() => {
    burst(at.x, at.y, { type: "spark", count: WIPE.sparks.count, speed: WIPE.sparks.speed });
  }, WIPE.sparks.delayMs);
  clearTimeout(abandonTimer);
  abandonTimer = setTimeout(abandon, WIPE.ttlMs);
  return true;
}

/**
 * The arriving shop content takes the wipe (`RouteContent`, in the commit). Returns the opening animation (the
 * caller cancels it if another navigation comes), or null when no wipe is waiting for `pathname`.
 */
export function openWipe(
  el: HTMLElement,
  pathname: string,
  now = performance.now(),
): Animation | null {
  const w = takeWipe(pathname, now);
  if (!w) return null;
  clearTimeout(abandonTimer);
  unsink(el);
  if (reducedMotionNow()) {
    hideStage();
    return null;
  }
  const rect = el.getBoundingClientRect();
  const x = w.x - rect.left;
  const y = w.y - rect.top;
  const vp = viewport();
  const r = wipeRadius(vp.width, vp.height);
  // Above the stage while it opens, on the page's own ground (the metal shows outside the circle only).
  el.style.position = "relative";
  el.style.zIndex = "16";
  el.style.background = "var(--pearl)";
  // At least down to the screen's bottom: a short page (the loading cover) must not leave metal showing below it.
  el.style.minHeight = `${String(Math.max(0, Math.ceil(vp.height - rect.top)))}px`;
  const open = anim(el, [{ clipPath: circleClip(0, x, y) }, { clipPath: circleClip(r, x, y) }], {
    duration: WIPE.durationMs,
    delay: remainingDelay(WIPE.shopDelayMs, w.elapsed),
    easing: WIPE.easing,
    // Held before it starts (closed), released at the end: a clip left on would crop the page below the fold.
    fill: "backwards",
  });
  const parts: Animation[] = [];
  for (const part of el.querySelectorAll<HTMLElement>("[data-rise]")) {
    const a = anim(
      part,
      [
        { opacity: 0, transform: `translateY(${String(WIPE.rise.fromPx)}px)` },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: WIPE.rise.ms,
        delay: remainingDelay(riseDelay(Number(part.dataset.rise)), w.elapsed),
        fill: "backwards",
      },
    );
    if (a) parts.push(a);
  }
  for (const bar of el.querySelectorAll<HTMLElement>("[data-wipe-bar]")) {
    const a = anim(
      bar,
      [{ transform: "scaleX(0)" }, { transform: bar.style.transform || "none" }],
      {
        duration: WIPE.bar.ms,
        delay: remainingDelay(WIPE.bar.delayMs, w.elapsed),
        fill: "backwards",
      },
    );
    if (a) parts.push(a);
  }
  const reset = (): void => {
    el.style.position = "";
    el.style.zIndex = "";
    el.style.background = "";
    el.style.minHeight = "";
    hideStage();
  };
  if (!open) {
    reset();
    return null;
  }
  // A safety net: if the circle's `finished` never settles (a frozen or throttled timeline), the page still
  // leaves the wipe once its time is up (and a second).
  const guard = setTimeout(
    reset,
    remainingDelay(WIPE.shopDelayMs, w.elapsed) + WIPE.durationMs + 1000,
  );
  const done = (): void => {
    clearTimeout(guard);
    reset();
  };
  // Every part lands with the circle's end or later: if the circle is cancelled (another navigation), they go too.
  open.finished.then(done, () => {
    for (const a of parts) a.cancel();
    done();
  });
  return open;
}

/**
 * The shop's back button (its click handler, before the link navigates to the Wallet): a copy of the shop closes
 * onto the button on the stage while the Wallet arrives underneath. Returns whether it started.
 */
export function wipeBack(
  href: string,
  event: { clientX: number; clientY: number } | null,
  button: Element,
  now = performance.now(),
): boolean {
  const s = stage;
  const content = contentEl();
  if (!s || !content || reducedMotionNow()) return false;
  clearTimeout(abandonTimer);
  // Back during the forward wipe: stop it where it is.
  for (const a of content.getAnimations()) a.cancel();
  content.style.position = "";
  content.style.zIndex = "";
  content.style.background = "";
  content.style.minHeight = "";
  unsink(content);
  hideStage();
  const box = placeStage(s);
  const rect = content.getBoundingClientRect();
  const clone = content.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-route-content");
  for (const n of [clone, ...clone.querySelectorAll("*")]) {
    n.removeAttribute("id");
    n.removeAttribute("data-testid");
  }
  clone.setAttribute("data-wipe-clone", "");
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  Object.assign(clone.style, {
    position: "absolute",
    left: `${String(rect.left - box.left)}px`,
    top: `${String(rect.top - box.top)}px`,
    width: `${String(rect.width)}px`,
    margin: "0",
    background: "var(--pearl)",
  });
  const metal = metalEl();
  if (metal) metal.hidden = true;
  s.append(clone);
  s.style.opacity = "";
  s.hidden = false;
  // The real shop underneath hides until the Wallet replaces it, so a slow network shows the page's ground.
  content.style.opacity = "0";
  const p = wipePoint(event, button.getBoundingClientRect(), rect);
  const vp = viewport();
  const r = wipeRadius(vp.width, vp.height);
  const close = anim(
    clone,
    [{ clipPath: circleClip(r, p.x, p.y) }, { clipPath: circleClip(0, p.x, p.y) }],
    {
      duration: WIPE.back.ms,
      easing: WIPE.easing,
    },
  );
  setWipeBack(href, now);
  if (close) close.onfinish = hideStage;
  else hideStage();
  abandonTimer = setTimeout(abandon, WIPE.ttlMs);
  return true;
}

/** The Wallet's content after a wipe back (`RouteContent`): it rises from the sunk state instead of sliding. */
export function returnWipe(
  el: HTMLElement,
  pathname: string,
  now = performance.now(),
): Animation | null {
  const back = takeWipeBack(pathname, now);
  if (!back) return null;
  clearTimeout(abandonTimer);
  el.style.opacity = "";
  if (reducedMotionNow()) return null;
  el.style.transformOrigin = sinkOrigin(el.getBoundingClientRect(), viewport());
  const a = anim(
    el,
    [
      { transform: `scale(${String(WIPE.walletScale)})`, opacity: WIPE.walletOpacity },
      { transform: "scale(1)", opacity: 1 },
    ],
    {
      duration: WIPE.back.ms,
      delay: remainingDelay(WIPE.back.walletDelayMs, back.elapsed),
      fill: "backwards",
    },
  );
  const done = (): void => {
    el.style.transformOrigin = "";
  };
  a?.finished.then(done, done);
  return a;
}
