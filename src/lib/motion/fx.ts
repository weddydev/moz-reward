/**
 * The one shared particle canvas (DESIGN §7, §7.2, §7.4 "FX engine"; PD-03): sparks, coins and gold leaf,
 * ported from the Molten reference (`design/reference/molten/index.html`, "shared FX canvas"). Every number
 * in `FX` is the reference's and is asserted by the spec table (`molten-spec.ts`, row `fx-engine`).
 *
 * - `spawn()` and `step()` are pure (seedable RNG) so the physics is unit-tested; `burst()` drives the canvas
 *   that `FxCanvas` mounts once in the root layout, outside the route transition, so a burst keeps falling
 *   over the next page and never blocks it (pointer-events: none).
 * - The loop runs only while particles live (zero rAF callbacks once idle), sleeps while the tab is hidden
 *   and picks up again without a jump, and clears at once when reduced motion is on (`<html class="rm">`,
 *   checked every frame, so switching it on mid-burst empties the canvas).
 * - Lite tier (`<html class="lite">`): half the particles and a 160 cap (420 full). Canvas DPR ≤ 2; the
 *   backing store is allocated on the first burst (pages that never burst keep a 0 × 0 canvas) and re-sized
 *   on resize / orientation change so particles stay sharp.
 */
export type ParticleType = "spark" | "coin" | "leaf";
export type Range = readonly [number, number];
export type Rng = () => number;

export type BurstOptions = {
  type?: ParticleType;
  count?: number;
  /** px/s */
  speed?: Range;
  /** Radians; −π/2 is straight up. Used when `spread` is under a full turn. */
  angle?: number;
  spread?: number;
  /** Seconds */
  life?: Range;
  /** px/s² */
  gravity?: number;
  /** Random start jitter, ± px. */
  jx?: number;
  jy?: number;
};

export type Particle = {
  type: ParticleType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  flip: number;
  vf: number;
  col: string;
  sway: number;
};

const TURN = Math.PI * 2;

export const FX = {
  cap: { full: 420, lite: 160 },
  liteCountFactor: 0.5,
  dprCap: 2,
  /** Longest frame step, seconds (a slow frame never teleports particles). */
  maxDt: 0.033,
  defaultCount: 20,
  defaultSpeed: [150, 420] as Range,
  gravity: { spark: 520, coin: 1100, leaf: 60 },
  drag: { spark: 0.975, coin: 0.975, leaf: 0.985 },
  life: { spark: [0.45, 0.9] as Range, coin: [1.1, 1.7] as Range, leaf: [2.2, 3.4] as Range },
  size: { spark: [10, 22] as Range, coin: [16, 26] as Range, leaf: [7, 13] as Range },
  spin: [-8, 8] as Range,
  flipSpeed: [6, 14] as Range,
  leafSway: { rate: 3, px: 40 },
  /** The last 35% of a particle's life fades out. */
  fadeFrom: 0.35,
  leafColours: ["#F2C14E", "#FFE08A", "#C8922C", "#FFF1BF", "#E0AE3E", "#B9862A"],
  /** A spark's trail: a line back along its velocity × this many seconds, this many px wide. */
  sparkTrail: 0.035,
  sparkLineWidth: 1.6,
} as const;

/** Mulberry32: a small, fast seeded RNG for tests and the playground's "seed" field. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const capFor = (lite: boolean): number => (lite ? FX.cap.lite : FX.cap.full);

/**
 * Adds one burst's particles to `parts` (never past the tier's cap) and returns how many were added. Same
 * draws, in the same order, as the reference's `burst()`.
 */
export function spawn(
  parts: Particle[],
  x: number,
  y: number,
  o: BurstOptions,
  env: { lite: boolean; rng: Rng },
): number {
  const { lite, rng } = env;
  const rnd = (a: number, b: number): number => a + rng() * (b - a);
  const type = o.type ?? "spark";
  const n = Math.round((o.count ?? FX.defaultCount) * (lite ? FX.liteCountFactor : 1));
  const [s0, s1] = o.speed ?? FX.defaultSpeed;
  const ang = o.angle ?? -Math.PI / 2;
  const spread = o.spread ?? TURN;
  const cap = capFor(lite);
  let added = 0;
  for (let i = 0; i < n && parts.length < cap; i++) {
    const a = spread >= TURN ? rng() * TURN : ang + rnd(-spread / 2, spread / 2);
    const sp = rnd(s0, s1);
    const life = rnd(...(o.life ?? FX.life[type]));
    const px = x + (o.jx ? rnd(-o.jx, o.jx) : 0);
    const py = y + (o.jy ? rnd(-o.jy, o.jy) : 0);
    parts.push({
      type,
      x: px,
      y: py,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      g: o.gravity ?? FX.gravity[type],
      drag: FX.drag[type],
      life,
      max: life,
      size: rnd(...FX.size[type]),
      rot: rnd(0, 6.28),
      vr: rnd(...FX.spin),
      flip: rnd(0, 6.28),
      vf: rnd(...FX.flipSpeed),
      col: FX.leafColours[Math.floor(rng() * FX.leafColours.length)] ?? FX.leafColours[0],
      sway: rnd(0, 6.28),
    });
    added++;
  }
  return added;
}

/** Advances every particle by `dt` seconds (frame-rate independent drag) and drops the dead ones. */
export function step(parts: Particle[], dt: number): void {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p) continue;
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    const k = Math.pow(p.drag, dt * 60);
    p.vx *= k;
    p.vy = p.vy * k + p.g * dt;
    if (p.type === "leaf") {
      p.sway += dt * FX.leafSway.rate;
      p.x += Math.sin(p.sway) * FX.leafSway.px * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.flip += p.vf * dt;
  }
}

/** 1 for most of a life, fading to 0 over the last 35%. */
export function alphaOf(p: Particle): number {
  const t = p.life / p.max;
  return t < FX.fadeFrom ? t / FX.fadeFrom : 1;
}

/* ---- drawing (the reference's sprites, drawn once) ---- */

type SpriteImage = ImageBitmap | HTMLCanvasElement;
type Sprites = { glow: SpriteImage; coin: SpriteImage };
type Paint2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * A sprite painted once, kept as an ImageBitmap where the browser has OffscreenCanvas (the same pixels as the
 * reference's canvas sprite). Drawing a canvas onto a canvas made Chromium snapshot the source on every
 * `drawImage`: 420 of them a frame held the stress run at 30–45 fps; a bitmap is drawn straight from memory.
 */
function sprite(s: number, paint: (g: Paint2D, s: number) => void): SpriteImage {
  if (typeof OffscreenCanvas === "function") {
    const oc = new OffscreenCanvas(s, s);
    const g = oc.getContext("2d");
    if (g) {
      paint(g, s);
      return oc.transferToImageBitmap();
    }
  }
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  if (g) paint(g, s);
  return c;
}

function makeSprites(): Sprites {
  const glow = sprite(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, "rgba(255,248,214,1)");
    r.addColorStop(0.22, "rgba(255,206,74,.95)");
    r.addColorStop(0.55, "rgba(240,160,30,.35)");
    r.addColorStop(1, "rgba(240,160,30,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
  const coin = sprite(64, (g, s) => {
    const c = s / 2;
    const gr = g.createLinearGradient(0, 0, s, s);
    gr.addColorStop(0, "#FFF1BF");
    gr.addColorStop(0.35, "#F2C14E");
    gr.addColorStop(0.7, "#B9862A");
    gr.addColorStop(1, "#7C5510");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(c, c, c - 2, 0, 7);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(124,85,16,.85)";
    g.stroke();
    g.beginPath();
    g.arc(c, c, c - 11, 0, 7);
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255,246,214,.9)";
    g.stroke();
    g.fillStyle = "rgba(124,85,16,.8)";
    g.beginPath();
    g.moveTo(c, c - 10);
    g.lineTo(c + 4, c);
    g.lineTo(c, c + 10);
    g.lineTo(c - 4, c);
    g.closePath();
    g.fill();
  });
  return { glow, coin };
}

/**
 * The reference's drawing, with the same pixels and cheaper calls: each coin and leaf gets its whole
 * translate·rotate·scale as one `setTransform` (times the DPR) instead of save/translate/rotate/scale/restore,
 * and the spark stroke style is set once per frame. On a canvas painted by the CPU (no GPU raster), the
 * per-particle save/restore alone doubled the frame cost at 4× CPU (A/B 21 Nov: 33 → 17 ms for 420 coins).
 */
export function draw(
  ctx: CanvasRenderingContext2D,
  parts: readonly Particle[],
  sp: Sprites,
  dpr: number,
): void {
  ctx.strokeStyle = "rgba(214,150,30,.9)";
  ctx.lineWidth = FX.sparkLineWidth;
  // Backwards, like the reference's single step-and-draw loop: the oldest particle paints last, on top
  // (celebrate's spark glows over its coins).
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p) continue;
    const t = p.life / p.max;
    ctx.globalAlpha = alphaOf(p);
    if (p.type === "spark") {
      const s = p.size * (0.5 + t * 0.6);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * FX.sparkTrail, p.y - p.vy * FX.sparkTrail);
      ctx.stroke();
      ctx.drawImage(sp.glow, p.x - s / 2, p.y - s / 2, s, s);
    } else if (p.type === "coin") {
      // translate(x, y) · rotate(rot × .3) · scale(max(.12, |cos flip|), 1)
      const r = p.rot * 0.3;
      const k = Math.max(0.12, Math.abs(Math.cos(p.flip)));
      const c = Math.cos(r) * dpr;
      const s = Math.sin(r) * dpr;
      ctx.setTransform(c * k, s * k, -s, c, p.x * dpr, p.y * dpr);
      ctx.drawImage(sp.coin, -p.size / 2, -p.size / 2, p.size, p.size);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      // translate(x, y) · rotate(rot) · scale(1, cos flip)
      const k = Math.cos(p.flip);
      const c = Math.cos(p.rot) * dpr;
      const s = Math.sin(p.rot) * dpr;
      ctx.setTransform(c, s, -s * k, c * k, p.x * dpr, p.y * dpr);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  ctx.globalAlpha = 1;
}

/* ---- the engine (one per page, mounted by FxCanvas) ---- */

type Engine = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sprites: Sprites | null;
  sized: boolean;
  dpr: number;
  w: number;
  h: number;
  parts: Particle[];
  raf: number;
  last: number;
  /** Frames drawn since mount (tests and the playground read it to prove the loop sleeps). */
  frames: number;
};

let engine: Engine | null = null;
let rng: Rng = Math.random;
let timeScale = 1;

const htmlHas = (cls: string): boolean =>
  typeof document !== "undefined" && document.documentElement.classList.contains(cls);
const reduced = (): boolean => htmlHas("rm");

function size(e: Engine): void {
  const dpr = Math.min(FX.dprCap, window.devicePixelRatio || 1);
  e.dpr = dpr;
  e.w = window.innerWidth;
  e.h = window.innerHeight;
  e.canvas.width = Math.round(e.w * dpr);
  e.canvas.height = Math.round(e.h * dpr);
  e.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  e.sized = true;
}

function stop(e: Engine): void {
  if (e.raf) cancelAnimationFrame(e.raf);
  e.raf = 0;
}

function clear(e: Engine): void {
  stop(e);
  e.parts.length = 0;
  if (e.sized) e.ctx.clearRect(0, 0, e.w, e.h);
}

function start(e: Engine): void {
  if (e.raf || document.hidden || e.parts.length === 0) return;
  e.last = performance.now();
  e.raf = requestAnimationFrame((now) => {
    tick(e, now);
  });
}

function tick(e: Engine, now: number): void {
  e.raf = 0;
  if (engine !== e) return;
  if (reduced()) {
    clear(e);
    return;
  }
  e.frames++;
  const dt = Math.min(FX.maxDt, Math.max(0, now - e.last) / 1000) * timeScale;
  e.last = now;
  e.ctx.clearRect(0, 0, e.w, e.h);
  step(e.parts, dt);
  if (e.sprites) draw(e.ctx, e.parts, e.sprites, e.dpr);
  if (e.parts.length) {
    e.raf = requestAnimationFrame((t) => {
      tick(e, t);
    });
  } else e.ctx.clearRect(0, 0, e.w, e.h);
}

/** Mounts the engine on the root layout's canvas; returns the cleanup. A second mount replaces the first. */
export function mountFx(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;
  if (engine) clear(engine);
  const e: Engine = {
    canvas,
    ctx,
    sprites: null,
    sized: false,
    dpr: 1,
    w: 0,
    h: 0,
    parts: [],
    raf: 0,
    last: 0,
    frames: 0,
  };
  engine = e;
  const onResize = (): void => {
    if (e.sized) size(e);
  };
  const onVisibility = (): void => {
    if (document.hidden) stop(e);
    else start(e);
  };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    clear(e);
    if (engine === e) engine = null;
  };
}

/** One burst as asked for, defaults filled in, and the particles it added (0 under reduced motion). */
export type BurstRecord = {
  x: number;
  y: number;
  type: ParticleType;
  count: number;
  speed: Range;
  angle: number;
  spread: number;
  added: number;
};

/** The last bursts (newest last), for the parity harness and the dev galleries (C-92). Never sent anywhere. */
const BURST_LOG_MAX = 32;
let burstLog: BurstRecord[] = [];

function logBurst(x: number, y: number, o: BurstOptions, added: number): void {
  burstLog.push({
    x,
    y,
    type: o.type ?? "spark",
    count: o.count ?? FX.defaultCount,
    speed: o.speed ?? FX.defaultSpeed,
    angle: o.angle ?? -Math.PI / 2,
    spread: o.spread ?? TURN,
    added,
  });
  if (burstLog.length > BURST_LOG_MAX) burstLog = burstLog.slice(-BURST_LOG_MAX);
}

/** The bursts since the last `clearFxBursts()` (at most the last 32). */
export const fxBursts = (): readonly BurstRecord[] => [...burstLog];
export const clearFxBursts = (): void => {
  burstLog = [];
};

/**
 * One burst at viewport point (x, y). A no-op (returns 0) under reduced motion, before the canvas is mounted
 * and on the server. Returns how many particles were added (the cap may cut a burst short).
 */
export function burst(x: number, y: number, o: BurstOptions = {}): number {
  const e = engine;
  if (!e || reduced()) {
    logBurst(x, y, o, 0);
    return 0;
  }
  if (!e.sized) size(e);
  e.sprites ??= makeSprites();
  const added = spawn(e.parts, x, y, o, { lite: htmlHas("lite"), rng });
  logBurst(x, y, o, added);
  start(e);
  return added;
}

/** Empties the canvas now (reduced motion switched on, playground reset). */
export function clearFx(): void {
  if (engine) clear(engine);
}

export type FxStats = {
  mounted: boolean;
  live: number;
  running: boolean;
  frames: number;
  cap: number;
};

export function fxStats(): FxStats {
  const e = engine;
  return {
    mounted: e !== null,
    live: e?.parts.length ?? 0,
    running: (e?.raf ?? 0) !== 0,
    frames: e?.frames ?? 0,
    cap: capFor(htmlHas("lite")),
  };
}

/** Playground and tests: a fixed seed makes bursts repeatable; null goes back to Math.random. */
export function setFxSeed(seed: number | null): void {
  rng = seed === null ? Math.random : createRng(seed);
}

/** Playground slow-mo: 1 = real time, 0.25 = quarter speed. */
export function setFxTimeScale(k: number): void {
  timeScale = Math.min(1, Math.max(0.05, k));
}
