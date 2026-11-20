/**
 * Gilded edge geometry (DESIGN §6.2; PD-02): a port of the Molten reference's `draw()` (design/reference/molten,
 * "gilded edge on cards"), so the SVG paths are the reference's own. Pure: sizes in, path strings out.
 * - A faceted gem (half-diagonal 8.5) on the top-left corner arc midpoint, five facets + a rim.
 * - A 2 px line from the gem over the arc and out along the top and down the side (lengths clamped), and a
 *   quieter 1.6 px echo on the bottom-right corner.
 * - A four-point glint star just outside the gem centre.
 */
export const EDGE = {
  /** Inset of the line from the card's outer edge (px). */
  offset: 1.2,
  /** Gem half-diagonal and the inner facet's share of it. */
  gem: 8.5,
  gemInner: 0.42,
  glint: 10,
  /** Facet fills, in the reference's order: left-top, top-right, right-bottom, bottom-left, centre. */
  facetFills: [
    "var(--gild-cream)",
    "var(--gild-honey)",
    "var(--gild-bronze)",
    "var(--gild-ochre)",
    "var(--gild-sun)",
  ],
  rim: "var(--gold-deep)",
  shine: "var(--gild-shine)",
  glintFill: "var(--gild-glint)",
  /** One glint-and-glide cycle (ms); each card starts at a random point of it. */
  cycleMs: 8000,
} as const;

export type EdgeGeometry = {
  viewBox: string;
  top: string;
  left: string;
  echoH: string;
  echoV: string;
  facets: readonly string[];
  rim: string;
  glint: string;
};

const clamp = (a: number, b: number, v: number): number => Math.max(a, Math.min(b, v));

/**
 * Paths for a card `width` × `height` whose top-left border radius is `radius` (px, as computed). `null` when
 * the card has no size yet (not laid out). Radius under 11 draws as 10; an unreadable radius as 20 (reference).
 */
export function gildedEdge(width: number, height: number, radius: number): EdgeGeometry | null {
  const W = width;
  const H = height;
  if (!W || !H) return null;
  const R = Math.max(10, (Number.isFinite(radius) && radius > 0 ? radius : 20) - 1);
  const o = EDGE.offset;
  const rho = R - o;
  const k = rho * Math.SQRT1_2;
  const mx = R - k;
  const my = R - k;
  const xt = clamp(R + 60, R + 220, W * 0.42);
  const yl = clamp(R + 40, R + 140, H * 0.45);
  const top = `M${String(mx)} ${String(my)} A${String(rho)} ${String(rho)} 0 0 1 ${String(R)} ${String(o)} H${String(xt)}`;
  const left = `M${String(mx)} ${String(my)} A${String(rho)} ${String(rho)} 0 0 0 ${String(o)} ${String(R)} V${String(yl)}`;
  const bx = W - R + k;
  const by = H - R + k;
  const xr = W - clamp(R + 30, R + 90, W * 0.18);
  const yr = H - clamp(R + 24, R + 70, H * 0.2);
  const echoH = `M${String(bx)} ${String(by)} A${String(rho)} ${String(rho)} 0 0 1 ${String(W - R)} ${String(H - o)} H${String(xr)}`;
  const echoV = `M${String(bx)} ${String(by)} A${String(rho)} ${String(rho)} 0 0 0 ${String(W - o)} ${String(H - R)} V${String(yr)}`;
  const sz = EDGE.gem;
  const t = sz * EDGE.gemInner;
  const P = (x: number, y: number): string => `${(mx + x).toFixed(2)} ${(my + y).toFixed(2)}`;
  const T = P(0, -sz);
  const Rt = P(sz, 0);
  const B = P(0, sz);
  const L = P(-sz, 0);
  const tT = P(0, -t);
  const tR = P(t, 0);
  const tB = P(0, t);
  const tL = P(-t, 0);
  const facets = [
    [L, T, tT, tL],
    [T, Rt, tR, tT],
    [Rt, B, tB, tR],
    [B, L, tL, tB],
    [tT, tR, tB, tL],
  ].map((q) => `M${q.join(" L")} Z`);
  const rim = `M${T} L${Rt} L${B} L${L} Z`;
  const gx = mx - 2;
  const gy = my - 2;
  const gs = EDGE.glint;
  const n = (v: number): string => String(v);
  const glint = `M${n(gx)} ${n(gy - gs)} Q${n(gx + 0.8)} ${n(gy - 0.8)} ${n(gx + gs)} ${n(gy)} Q${n(gx + 0.8)} ${n(gy + 0.8)} ${n(gx)} ${n(gy + gs)} Q${n(gx - 0.8)} ${n(gy + 0.8)} ${n(gx - gs)} ${n(gy)} Q${n(gx - 0.8)} ${n(gy - 0.8)} ${n(gx)} ${n(gy - gs)} Z`;
  return { viewBox: `0 0 ${String(W)} ${String(H)}`, top, left, echoH, echoV, facets, rim, glint };
}
