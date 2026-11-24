import { GATE } from "./gate-constants";
import { buildParticles, particleAt, sampleTargets } from "./gate-particles";
import type { Box } from "./presets";

/**
 * Gilded Gate, the first-scan entry on `/s/[code]?src=qr|nfc` (P1-03, DESIGN §8.1). Pure parts: the
 * timeline, the per-shop session key, the pre-paint script and the gate → cover morph geometry.
 *
 * How the pieces fit (DECISIONS 17 Nov "Gilded Gate: CSS timeline from first paint, lazy JS morph"):
 * - The page renders the gate markup only for `src=qr|nfc` (`GildedGate.tsx`). It is hidden by default;
 *   `gateScript` runs right after it, before first paint, and sets `data-state="play"` unless this shop's gate
 *   already played in this browser session (or storage is blocked, or the tab is in the background). No
 *   JavaScript → no gate, never a stuck cover.
 * - Steps 1–3 and a plain step-4 exit are CSS keyframes (`gilded-gate.css`): they start at first paint and run
 *   on the compositor while the page hydrates. Taps, wheel and keys skip from the first frame (the script).
 * - Step 4's shared-element morph (`runGateMorph`) is a second inline script right after the landing markup:
 *   it runs during parse, so it is in time even on a slow phone. The lazy chunk (`gilded-gate-run.ts`, loaded
 *   only when the gate plays) plays `arrival` if audio is already unlocked.
 * - Client-side renders (back navigation within the app) never run the inline script, so the gate never
 *   replays there; a reload or a fresh load reads the session key.
 */
export { GATE } from "./gate-constants";

export type GateTimeline = {
  staggerMs: number;
  /** When the last letter has forged. */
  forgeEndMs: number;
  /** The subtitle's delay after the forge beat. */
  subDelayMs: number;
  handoffMs: number;
  totalMs: number;
};

/** The per-name timeline: the reference's 40 ms letter stagger, shrunk for long names (see `GATE.forge`). */
export function gateTimeline(letters: number): GateTimeline {
  const f = GATE.forge;
  const n = Math.max(1, Math.floor(letters));
  const room = f.endCapMs - f.at - f.leadMs - f.letterMs;
  const staggerMs = n > 1 ? Math.min(f.staggerMs, room / (n - 1)) : f.staggerMs;
  const forgeEndMs = f.at + f.leadMs + (n - 1) * staggerMs + f.letterMs;
  const subDelayMs = f.leadMs + n * staggerMs + f.subGapMs;
  const subEndMs = f.at + subDelayMs + f.subMs;
  const handoffMs = Math.ceil(Math.max(GATE.handoffMinMs, forgeEndMs, subEndMs));
  return { staggerMs, forgeEndMs, subDelayMs, handoffMs, totalMs: handoffMs + GATE.morphMs };
}

export type GateTitle = { words: string[][]; letters: number; longestWord: number };

/** The shop name split for the forge: words (wrapped as wholes) of letters (grapheme clusters). */
export function gateTitle(name: string): GateTitle {
  const seg = new Intl.Segmenter("en-GB", { granularity: "grapheme" });
  const words = name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((w) => [...seg.segment(w)].map((g) => g.segment));
  const letters = words.reduce((sum, w) => sum + w.length, 0);
  const longestWord = words.reduce((m, w) => Math.max(m, w.length), 0);
  return { words, letters, longestWord };
}

export type GateSource = "qr" | "nfc";

/** The entry source that plays the gate: exactly `qr` or `nfc` (print kits and NFC tags use lowercase). */
export function gateEntrySource(src: string | string[] | undefined): GateSource | null {
  return src === "qr" || src === "nfc" ? src : null;
}

export const gateStorageKey = (code: string): string => `moz.gate.${code}`;

/** JSON string literal that is also safe inside `<script>` (no `</script>` or `<!--`). */
const scriptString = (value: string): string => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * The inline pre-paint script (nonce'd by the page). Plays at most once per shop per session; skip = click
 * (a tap ends in one), a scroll of the page (a swipe on the gate scrolls it; inner scrollers don't count), wheel,
 * or any key but a bare
 * modifier; the tab going to the background ends it too (PD-09: it finishes at its end state, the canvas frozen
 * otherwise); the gate's own animation end also ends it, and stops the morph (the hidden gate hides its copy).
 * Clicks, not pointerdown: hiding the gate on touch-down would hand the rest of the tap to the button below.
 */
export function gateScript(code: string): string {
  return `(function(){var g=document.getElementById(${scriptString(GATE.id)}),k=${scriptString(gateStorageKey(code))};if(!g)return;try{if(document.hidden||sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1")}catch(e){return}var T=["click","wheel","scroll","keydown"];function end(){g.setAttribute("data-state","done");var p=g.querySelector("[data-gate-panel]");if(p&&p.getAnimations)p.getAnimations({subtree:true}).forEach(function(a){a.cancel()});T.forEach(function(t){removeEventListener(t,skip,true)})}function skip(e){if(e.type==="keydown"&&/^(Shift|Control|Alt|Meta)$/.test(e.key))return;if(e.type==="scroll"&&e.target!==document)return;end()}g.setAttribute("data-state","play");T.forEach(function(t){addEventListener(t,skip,{capture:true,passive:true})});document.addEventListener("visibilitychange",function(){if(document.hidden)end()});g.addEventListener("animationend",function(e){if(e.target===g)end()})})()`;
}

export type GateMorph = {
  scale: number;
  tx: number;
  ty: number;
  /** Clip insets in the cover's own (unscaled) pixels. */
  inset: { x: number; y: number };
  fromRadius: number;
  /** Outer element: opacity + transform (compositor-friendly on its own). */
  move: Keyframe[];
  /** Inner element: clip-path, kept off the transform's element so the transform can stay on the compositor. */
  clip: Keyframe[];
};

/**
 * The cover clone starts scaled down (uniformly, so the image never stretches) and clipped to the gate's
 * box and radius, then grows to the cover's box. Null for a box that can't be used.
 *
 * Self-contained on purpose (no outside helpers or imports): `gateMorphScript` inlines its source.
 */
export function gateMorph(
  gate: Box,
  cover: Box,
  gateRadius: number,
  coverRadius: number,
): GateMorph | null {
  const usable = (b: Box): boolean =>
    [b.left, b.top, b.width, b.height].every(Number.isFinite) && b.width > 0 && b.height > 0;
  const px = (n: number): string => `${String(Math.round(n * 1000) / 1000)}px`;
  if (!usable(gate) || !usable(cover)) return null;
  const scale = Math.max(gate.width / cover.width, gate.height / cover.height);
  const x = (cover.width - gate.width / scale) / 2;
  const y = (cover.height - gate.height / scale) / 2;
  const tx = gate.left - cover.left - x * scale;
  const ty = gate.top - cover.top - y * scale;
  const fromRadius = gateRadius / scale;
  return {
    scale,
    tx,
    ty,
    inset: { x, y },
    fromRadius,
    move: [
      {
        offset: 0,
        opacity: 0,
        transform: `translate(${px(tx)}, ${px(ty)}) scale(${String(Math.round(scale * 1e6) / 1e6)})`,
      },
      { offset: 0.3, opacity: 1 },
      { offset: 1, opacity: 1, transform: "none" },
    ],
    clip: [
      { offset: 0, clipPath: `inset(${px(y)} ${px(x)} round ${px(fromRadius)})` },
      { offset: 1, clipPath: `inset(0px round ${px(coverRadius)})` },
    ],
  };
}

export type MorphConfig = {
  id: string;
  radius: number;
  morphMs: number;
  delayMs: number;
  leadMs: number;
  ease: string;
};

/**
 * Step 4's shared-element morph, run by an inline script right after the landing markup (so during parse,
 * before any framework JS: on a slow phone it is still ready long before 1000ms). A clone of the page's cover
 * grows out of the gate's box into the cover's box, timed against the CSS timeline's own start (and held with
 * it if something pauses it). Skipped under reduced motion (the CSS then runs `gate-fade`, not `gate-life`).
 * The real cover hides while it runs (`data-morph`), so only one cover is ever on screen. The copy is the
 * gate's server-rendered `[data-gate-panel]`: this only sizes and animates it, so hydration sees the server's DOM.
 *
 * Self-contained on purpose: `gateMorphScript` inlines its source with `gateMorph` passed in.
 */
export function runGateMorph(cfg: MorphConfig, morph: typeof gateMorph): void {
  const gate = document.getElementById(cfg.id);
  if (!gate || gate.getAttribute("data-state") !== "play") return;
  const life = gate
    .getAnimations()
    .filter((a) => (a as CSSAnimation).animationName === "gate-life")[0];
  if (!life) return;
  life.ready
    .then(() => {
      const elapsed = life.currentTime;
      if (gate.getAttribute("data-state") !== "play" || typeof elapsed !== "number") return;
      if (elapsed > cfg.delayMs - cfg.leadMs) return; // step 4 has begun: leave the CSS exit alone
      const cover = document.querySelector<HTMLElement>("[data-gate-cover]");
      const frame = gate.querySelector<HTMLElement>("[data-gate-frame]");
      const panel = gate.querySelector<HTMLElement>("[data-gate-panel]");
      const art = panel?.firstElementChild as HTMLElement | null | undefined;
      if (!cover || !frame || !panel || !art) return;
      const c = cover.getBoundingClientRect();
      const m = morph(
        frame.getBoundingClientRect(),
        c,
        cfg.radius,
        Number.parseFloat(getComputedStyle(cover).borderTopLeftRadius) || 0,
      );
      if (!m) return;
      // Styles and animations only: the panel and its cover copy are server-rendered (no DOM changes before
      // React hydrates).
      Object.assign(panel.style, {
        left: `${String(c.left)}px`,
        top: `${String(c.top)}px`,
        width: `${String(c.width)}px`,
        height: `${String(c.height)}px`,
      });
      gate.setAttribute("data-morph", "");
      const ease =
        getComputedStyle(document.documentElement).getPropertyValue("--ease-in-out").trim() ||
        cfg.ease;
      const timing: KeyframeAnimationOptions = {
        duration: cfg.morphMs,
        delay: cfg.delayMs,
        easing: ease,
        fill: "both",
      };
      for (const a of [panel.animate(m.move, timing), art.animate(m.clip, timing)]) {
        if (life.playState === "running" && typeof life.startTime === "number") {
          a.startTime = life.startTime;
        } else {
          a.pause();
          a.currentTime = elapsed;
        }
      }
    })
    .catch(() => undefined); // cancelled by a skip
}

/** The inline morph script (nonce'd; rendered after the landing content, only with the gate); `handoffMs` from
 *  `gateTimeline`. */
export function gateMorphScript(handoffMs: number): string {
  const cfg: MorphConfig = {
    id: GATE.id,
    radius: GATE.coin.radius,
    morphMs: GATE.morphMs,
    delayMs: handoffMs,
    leadMs: GATE.morphLeadMs,
    ease: "cubic-bezier(.65,0,.35,1)",
  };
  return `(${runGateMorph.toString()})(${JSON.stringify(cfg).replace(/</g, "\\u003c")},(${gateMorph.toString()}))`;
}

export type GateCanvasOptions = {
  lite: boolean;
  /** The timeline's start on the rAF clock (`performance.now()` / `document.timeline`). */
  t0: number;
  /** Slow motion factor (1 = real time; the /dev/molten stage's ¼× is 4). */
  slow: number;
  /** False once the gate is skipped or replayed: the loop stops. */
  alive: () => boolean;
  /**
   * The real gate's clock: its CSS timeline's start (first paint), once known. The canvas then runs on the
   * same clock as the beats even when first paint lags parsing on a slow phone (design review PD-09).
   */
  start?: () => number | null;
};

export type GateCanvasLib = {
  sampleTargets: typeof sampleTargets;
  buildParticles: typeof buildParticles;
  particleAt: typeof particleAt;
};

/**
 * Steps 1–2 on the night canvas (`[data-gate-canvas]` inside `host`): the breathing spark, then the particles
 * spiralling into the coin (`[data-gate-frame]`), drawn with trails until 1900 ms (the reference's `frame()`,
 * verbatim). The canvas's own CSS paints the night and fades it at 1250 ms, so the gate is right from first
 * paint even before this runs. Returns a stop function.
 *
 * Self-contained on purpose (helpers come in `lib`): `gateCanvasScript` inlines its source.
 */
export function runGateCanvas(
  host: HTMLElement,
  o: GateCanvasOptions,
  lib: GateCanvasLib,
): () => void {
  const cv = host.querySelector<HTMLCanvasElement>("[data-gate-canvas]");
  const coin = host.querySelector("[data-gate-frame]");
  const ctx = cv?.getContext("2d");
  if (!cv || !coin || !ctx) return () => undefined;
  let raf = 0;
  let stopped = false;
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = r.width;
  const H = r.height;
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lr = coin.getBoundingClientRect();
  const cx = lr.left - r.left + lr.width / 2;
  const cy = lr.top - r.top + lr.height / 2;
  // The coin's two rings, stroked on an offscreen canvas: their pixels are where the particles settle.
  const s = 168;
  const off = document.createElement("canvas");
  off.width = off.height = s;
  const g = off.getContext("2d");
  if (!g) return () => undefined;
  g.strokeStyle = "#000";
  g.lineWidth = 7;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 5, 0, 7);
  g.stroke();
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.4, 0, 7);
  g.stroke();
  // A smaller coin (landscape phones) gets the same pattern, scaled to it.
  const k = lr.width / s;
  const targets = lib
    .sampleTargets(g.getImageData(0, 0, s, s).data, s, o.lite, Math.random)
    .map(([x, y]) => [x * k, y * k] as const);
  const P = lib.buildParticles(targets, Math.max(W, H), Math.random);
  const glow = document.createElement("canvas");
  glow.width = glow.height = 64;
  const gg = glow.getContext("2d");
  if (gg) {
    const rg = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, "rgba(255,250,225,1)");
    rg.addColorStop(0.25, "rgba(255,206,74,.9)");
    rg.addColorStop(1, "rgba(255,170,40,0)");
    gg.fillStyle = rg;
    gg.fillRect(0, 0, 64, 64);
  }
  ctx.fillStyle = "#15100A";
  ctx.fillRect(0, 0, W, H);
  const frame = (now: number): void => {
    if (stopped || !o.alive()) return;
    const t = (now - (o.start?.() ?? o.t0)) / o.slow;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(21,16,10,.3)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    if (t < 520) {
      const sz = 30 + 110 * Math.sin((t / 520) * Math.PI);
      ctx.globalAlpha = 1;
      ctx.drawImage(glow, cx - sz / 2, cy - sz / 2, sz, sz);
    }
    for (const p of P) {
      const at = lib.particleAt(p, t, cx, cy);
      if (!at) continue;
      ctx.globalAlpha = at.alpha;
      ctx.fillStyle = p.c;
      ctx.fillRect(at.x, at.y, p.s, p.s);
      if (p.g) ctx.drawImage(glow, at.x - 6, at.y - 6, 12, 12);
    }
    ctx.globalAlpha = 1;
    if (t < 1900) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export type GateSceneOptions = Omit<GateCanvasOptions, "t0"> & {
  /** From `gateTimeline` (the letters' stagger and the subtitle's delay after the forge beat). */
  staggerMs: number;
  subDelayMs: number;
};

export type GateSceneLib = GateCanvasLib & { runGateCanvas: typeof runGateCanvas };

/**
 * Plays the scene inside `host` (the real gate, or the /dev/molten stage): the reference intro's `play()`, beat
 * for beat, as Web Animations with delays instead of its timers (a busy main thread can't make a delay late, and
 * each still runs on the compositor). Each effect keeps the reference's own keyframes, duration and effect-level
 * easing; a beat that hasn't started yet leaves the element's own (hidden) style, as the timer did. Returns the
 * animations and a stop function (the canvas loop).
 *
 * Self-contained on purpose: `gateSceneScript` inlines its source with `lib` passed in.
 */
export function playGateScene(
  host: HTMLElement,
  o: GateSceneOptions,
  lib: GateSceneLib,
): { anims: Animation[]; stop: () => void } {
  const OUT = "cubic-bezier(.22,1,.36,1)";
  const spring =
    CSS.supports("transition-timing-function", "linear(0, 1)") &&
    getComputedStyle(document.documentElement).getPropertyValue("--spring").trim()
      ? getComputedStyle(document.documentElement).getPropertyValue("--spring").trim()
      : "cubic-bezier(.34,1.56,.64,1)";
  const D = (ms: number): number => ms * o.slow;
  const anims: Animation[] = [];
  const q = (sel: string): HTMLElement | null => host.querySelector<HTMLElement>(sel);
  /** As if `el.animate(kf, {duration, easing, fill: "both"})` were called at `at` ms (the reference's timers). */
  const A = (
    el: Element | null,
    at: number,
    kf: Keyframe[],
    duration: number,
    easing: string = OUT,
  ): void => {
    if (!el) return;
    anims.push(el.animate(kf, { duration: D(duration), delay: D(at), easing, fill: "forwards" }));
  };
  /** The same with an inner delay under `fill: both` (the letters, the subtitle): the first keyframe holds. */
  const held = (
    el: Element | null,
    at: number,
    hold: number,
    from: Keyframe,
    to: Keyframe,
    duration: number,
  ): void => {
    if (!el) return;
    const h = hold / (hold + duration);
    anims.push(
      el.animate(
        [
          { ...from, offset: 0 },
          { ...from, offset: h, easing: OUT },
          { ...to, offset: 1 },
        ],
        { duration: D(hold + duration), delay: D(at), easing: "linear", fill: "forwards" },
      ),
    );
  };
  const t0 = performance.now();
  const stop = lib.runGateCanvas(host, { ...o, t0 }, lib);
  // 1250 ms, ignite: the night fades, one flash, the shockwave, the glow, the coin lands, the rays.
  A(q("[data-gate-canvas]"), 1250, [{ opacity: 1 }, { opacity: 0 }], 560);
  A(q(".gate-flash"), 1250, [{ opacity: 0 }, { opacity: 0.95, offset: 0.18 }, { opacity: 0 }], 650);
  A(
    q(".gate-shock"),
    1250,
    [
      { opacity: 1, transform: "scale(.4)" },
      { opacity: 0, transform: "scale(4.4)" },
    ],
    850,
  );
  A(
    q(".gate-glow"),
    1250,
    [
      { opacity: 0, transform: "scale(.5)" },
      { opacity: 1, transform: "scale(1.15)", offset: 0.35 },
      { opacity: 0.55, transform: "scale(1)" },
    ],
    1300,
  );
  A(
    q("[data-gate-frame]"),
    1250,
    [
      { opacity: 0, transform: "scale(1.4)" },
      { opacity: 1, transform: "scale(.95)", offset: 0.6 },
      { opacity: 1, transform: "scale(1)" },
    ],
    760,
    "cubic-bezier(.2,.9,.3,1.2)",
  );
  A(q(".gate-rays"), 1250, [{ opacity: 0 }, { opacity: 1 }], 1000);
  // 1420 ms, orbit.
  A(
    q(".gate-orbits"),
    1420,
    [
      { opacity: 0, transform: "scale(.7)" },
      {
        opacity: 1,
        transform: window.matchMedia(
          "(max-width:640px), (max-height:520px) and (orientation:landscape)",
        ).matches
          ? "scale(.68)"
          : "scale(1)",
      },
    ],
    900,
    spring,
  );
  // 1480 ms, forge the letters: each rises from −85° while its weight goes 150 → 640.
  A(
    q(".gate-pre"),
    1480,
    [
      { opacity: 0, transform: "translateY(10px)", letterSpacing: ".5em" },
      { opacity: 1, transform: "none", letterSpacing: ".24em" },
    ],
    700,
  );
  const chars = [...host.querySelectorAll<HTMLElement>(".gate-ch")];
  const axes = '"opsz" 144,"SOFT" 50,"WONK" 1,"wght" ';
  chars.forEach((c, i) => {
    held(
      c,
      1480,
      120 + i * o.staggerMs,
      {
        opacity: 0,
        transform: "translateY(45%) rotateX(-85deg) scale(.9)",
        fontVariationSettings: `${axes}150`,
      },
      { opacity: 1, transform: "none", fontVariationSettings: `${axes}640` },
      760,
    );
  });
  held(
    q(".gate-sub"),
    1480,
    o.subDelayMs,
    { opacity: 0, transform: "translateY(8px)" },
    { opacity: 1, transform: "none" },
    500,
  );
  // 2350 ms, shine: light sweeps across the letters (no fill: each returns to its own position).
  chars.forEach((c, i) => {
    const own = c.style.backgroundPosition;
    anims.push(
      c.animate(
        [{ backgroundPosition: own }, { backgroundPosition: "0% 0" }, { backgroundPosition: own }],
        {
          duration: D(1200),
          delay: D(2350 + i * 45),
          easing: "ease-in-out",
          fill: "none",
        },
      ),
    );
  });
  return { anims, stop };
}

/**
 * The real gate's scene starter, inlined right after the gate markup (it runs during parse, like the morph,
 * and starts the scene in the first frame). Nothing plays under reduced motion: the root then runs `gate-fade`, not `gate-life`,
 * and the CSS shows the end frame. Self-contained: `gateSceneScript` passes `play` and `lib` in.
 */
export function startGate(
  id: string,
  t: { staggerMs: number; subDelayMs: number },
  play: typeof playGateScene,
  lib: GateSceneLib,
): void {
  const gate = document.getElementById(id);
  if (!gate || gate.getAttribute("data-state") !== "play") return;
  // In the first frame, not during parse: first paint has then done the document's style and layout, so
  // nothing here forces them inside the parser's task (a long task at 4× CPU, gate 24 Nov). The beats are then
  // set to the CSS timeline's own start, so they keep its clock.
  requestAnimationFrame(() => {
    if (gate.getAttribute("data-state") !== "play") return;
    const life = gate
      .getAnimations()
      .filter((a) => (a as CSSAnimation).animationName === "gate-life")[0];
    if (!life) return;
    const { anims } = play(
      gate,
      {
        lite: document.documentElement.classList.contains("lite"),
        slow: 1,
        alive: () => gate.getAttribute("data-state") === "play",
        start: () => (typeof life.startTime === "number" ? life.startTime : null),
        staggerMs: t.staggerMs,
        subDelayMs: t.subDelayMs,
      },
      lib,
    );
    if (life.playState === "running" && typeof life.startTime === "number") {
      for (const a of anims) a.startTime = life.startTime;
    } else if (typeof life.currentTime === "number") {
      for (const a of anims) {
        a.pause();
        a.currentTime = life.currentTime;
      }
    }
  });
}

/** The inline scene script (nonce'd; rendered right after the gate, only with it). */
export function gateSceneScript(t: GateTimeline): string {
  const lib = `{runGateCanvas:(${runGateCanvas.toString()}),sampleTargets:(${sampleTargets.toString()}),buildParticles:(${buildParticles.toString()}),particleAt:(${particleAt.toString()})}`;
  const timing = JSON.stringify({ staggerMs: t.staggerMs, subDelayMs: t.subDelayMs });
  return `(${startGate.toString()})(${JSON.stringify(GATE.id)},${timing},(${playGateScene.toString()}),${lib})`;
}
