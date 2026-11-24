"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { EDGE, type EdgeGeometry, gildedEdge } from "@/lib/motion/gilded-edge";
import { currentTier } from "@/lib/motion/tier";

/**
 * The gilded edge (DESIGN v2 §6.2; PD-02): rendered as the last child of a card that doesn't clip, it draws the
 * reference's gem, line and echo from the card's own size and corner radius (`gildedEdge`), redraws on resize,
 * starts at a random point of the 8 s glint-and-glide cycle, sleeps off screen, and replays at once when a
 * fine pointer enters the card (not under reduced motion or the lite tier). Decorative: aria-hidden.
 */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const reducedMotion = (): boolean => document.documentElement.classList.contains("rm");

export function GildedEdge(): React.JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [g, setG] = useState<EdgeGeometry | null>(null);
  const [phase, setPhase] = useState<string | null>(null);

  useIsoLayoutEffect(() => {
    const svg = ref.current;
    const card = svg?.parentElement;
    if (!svg || !card) return;
    const draw = (): void => {
      setG(
        gildedEdge(
          card.clientWidth,
          card.clientHeight,
          parseFloat(getComputedStyle(card).borderTopLeftRadius),
        ),
      );
    };
    draw();
    // A random point of the cycle per card (reference: −random × 8 s), set after hydration so the server HTML
    // and the first client render agree.
    setPhase(`${(-Math.random() * (EDGE.cycleMs / 1000)).toFixed(2)}s`);
    const resize = new ResizeObserver(draw);
    resize.observe(card);
    const view = new IntersectionObserver((entries) => {
      for (const e of entries) card.toggleAttribute("data-paused", !e.isIntersecting);
    });
    view.observe(card);
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    // Hover plays the glint and glide at once (DESIGN §6.2). The reference sets currentTime to the (negative,
    // random) delay, which parks the animation in its before phase until the phase comes round again (up to
    // 8 s dark); here the delay drops to 0 and the cycle restarts (DECISIONS 20 Nov).
    const replay = (): void => {
      if (reducedMotion() || currentTier() === "lite") return;
      for (const el of svg.querySelectorAll(".sm-shine, .sm-glint")) {
        for (const a of el.getAnimations()) {
          a.effect?.updateTiming({ delay: 0 });
          a.currentTime = 0;
        }
      }
    };
    if (fine) card.addEventListener("pointerenter", replay);
    return () => {
      resize.disconnect();
      view.disconnect();
      card.removeEventListener("pointerenter", replay);
    };
  }, []);

  // Light glides the full length of each line: its length feeds the keyframes (--L).
  useIsoLayoutEffect(() => {
    const svg = ref.current;
    if (!svg || !g) return;
    for (const p of svg.querySelectorAll<SVGPathElement>(".sm-shine")) {
      p.style.setProperty("--L", p.getTotalLength().toFixed(1));
    }
  }, [g]);

  // Stroke via style: presentation attributes don't resolve var(), style does (and url(#…) too).
  const line = (stroke: string, width: number) =>
    ({ fill: "none", style: { stroke }, strokeWidth: width, strokeLinecap: "round" }) as const;
  const stops = (list: readonly (readonly [number, string, number?])[]) =>
    list.map(([offset, colour, opacity]) => (
      <stop key={offset} offset={offset} style={{ stopColor: colour, stopOpacity: opacity ?? 1 }} />
    ));
  const main = [
    [0, "var(--gild-amber)"],
    [0.14, "var(--gild-honey)"],
    [0.32, "var(--gild-sun)"],
    [0.6, "var(--gild-brass)", 0.8],
    [1, "var(--gild-brass)", 0],
  ] as const;
  const echo = [
    [0, "var(--gild-ochre)", 0.9],
    [0.45, "var(--gild-satin)", 0.6],
    [1, "var(--gild-satin)", 0],
  ] as const;

  return (
    <svg
      ref={ref}
      className="m-seam"
      aria-hidden="true"
      focusable="false"
      viewBox={g?.viewBox}
      style={phase ? ({ "--sd": phase } as React.CSSProperties) : undefined}
      data-gilded-edge=""
    >
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="0">
          {stops(main)}
        </linearGradient>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
          {stops(main)}
        </linearGradient>
        <linearGradient id={`${id}hr`} x1="1" y1="0" x2="0" y2="0">
          {stops(echo)}
        </linearGradient>
        <linearGradient id={`${id}vr`} x1="0" y1="1" x2="0" y2="0">
          {stops(echo)}
        </linearGradient>
      </defs>
      {g ? (
        <>
          <path d={g.top} {...line(`url(#${id}h)`, 2)} />
          <path d={g.left} {...line(`url(#${id}v)`, 2)} />
          <path d={g.top} className="sm-shine" {...line(EDGE.shine, 2)} />
          <path d={g.left} className="sm-shine" {...line(EDGE.shine, 2)} />
          <path d={g.echoH} {...line(`url(#${id}hr)`, 1.6)} />
          <path d={g.echoV} {...line(`url(#${id}vr)`, 1.6)} />
          <g className="sm-gem">
            {g.facets.map((d, i) => (
              <path key={d} d={d} style={{ fill: EDGE.facetFills[i] }} />
            ))}
            <path
              d={g.rim}
              fill="none"
              style={{ stroke: EDGE.rim }}
              strokeWidth={0.6}
              strokeOpacity={0.85}
              strokeLinejoin="round"
            />
          </g>
          <path d={g.glint} className="sm-glint" style={{ fill: EDGE.glintFill }} />
        </>
      ) : null}
    </svg>
  );
}
