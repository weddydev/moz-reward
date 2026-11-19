import { useId } from "react";
import { cx } from "@/lib/cx";
import { INGOT_BOX, ingotFill, levelY, mouldRightX } from "@/lib/loyalty/ingot";

/**
 * The gold ingot (DESIGN §6, §8.3; P1-08): a bevelled trapezoid mould, the liquid clipped to it, a wave on its
 * surface, the gold gradient and a specular highlight. This is the static picture, safe in server components;
 * `IngotPour` (src/components/motion) animates the same parts and always comes to rest on exactly this.
 * Accessible as one image: "720 of 1,000 gold, 72%" (or `decorative` when the text beside it says it all).
 * Empty → an empty mould, no wave; full → a flat top, no wave.
 */
export type IngotProps = {
  gold: number;
  size: number;
  /** Milestone percents, drawn as ticks beside the mould (the settings preview). */
  marks?: readonly number[];
  decorative?: boolean;
  /** Adds the pour's stream and glint (hidden at rest); only `IngotPour` sets it. */
  animated?: boolean;
  className?: string;
};

/** Ten periods of a gentle wave (60 units each), wide enough to drift two periods across the mould. */
const WAVE = `M-240,0${"q15,-5 30,0q15,5 30,0".repeat(10)}V8H-240Z`;
const MOULD = "66,14 174,14 192,40 226,124 14,124 48,40";
const TOP_FACE = "66,14 174,14 192,40 48,40";

export function Ingot({
  gold,
  size,
  marks = [],
  decorative = false,
  animated = false,
  className,
}: IngotProps): React.JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = ingotFill(gold, size);
  const level = levelY(fill.fraction);
  const full = fill.fraction >= 1;
  const url = (name: string): string => `url(#${id}-${name})`;
  return (
    <svg
      viewBox={`0 0 ${String(INGOT_BOX.width)} ${String(INGOT_BOX.height)}`}
      className={cx("block h-auto w-full overflow-hidden", className)}
      data-ingot=""
      data-percent={fill.percent}
      {...(decorative
        ? { "aria-hidden": true, focusable: false }
        : { role: "img", "aria-label": fill.label })}
    >
      <defs>
        <linearGradient
          id={`${id}-gold`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="-20"
          x2="240"
          y2="140"
        >
          <stop offset="0" stopColor="var(--gold-700)" />
          <stop offset=".35" stopColor="var(--gold-500)" />
          <stop offset=".55" stopColor="var(--gold-300)" />
          <stop offset=".75" stopColor="var(--gold-500)" />
          <stop offset="1" stopColor="var(--gold-700)" />
        </linearGradient>
        <clipPath id={`${id}-mould`}>
          <polygon points={MOULD} />
        </clipPath>
        {/* In the liquid's own coordinates (it moves with it): the highlight shows on gold only. */}
        <clipPath id={`${id}-liquid`}>
          <rect x="0" y="4" width="240" height="140" />
        </clipPath>
        {animated ? (
          <>
            <clipPath id={`${id}-top`}>
              <polygon points={TOP_FACE} />
            </clipPath>
            <linearGradient id={`${id}-shine`}>
              <stop offset="0" stopColor="var(--surface)" stopOpacity="0" />
              <stop offset=".5" stopColor="var(--surface)" stopOpacity=".9" />
              <stop offset="1" stopColor="var(--surface)" stopOpacity="0" />
            </linearGradient>
          </>
        ) : null}
      </defs>

      <polygon points={MOULD} fill="var(--surface-2)" />
      <polygon points={TOP_FACE} fill="var(--gold-100)" />

      {animated ? (
        <rect
          data-ingot-part="stream"
          x="116"
          y="0"
          width="8"
          height="124"
          rx="4"
          fill={url("gold")}
          opacity="0"
          style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
        />
      ) : null}

      {fill.fraction > 0 ? (
        <g clipPath={url("mould")}>
          <g data-ingot-part="fill" transform={`translate(0 ${String(level)})`}>
            <rect x="0" y="4" width="240" height="140" fill={url("gold")} />
            {/* Specular highlight on the front face, drawn where the liquid is. */}
            <polygon
              points={`62,${String(50 - level)} 92,${String(50 - level)} 66,${String(112 - level)} 40,${String(112 - level)}`}
              fill="var(--surface)"
              opacity=".16"
              clipPath={url("liquid")}
            />
            {full ? null : (
              <path
                data-ingot-part="wave"
                d={WAVE}
                fill="var(--gold-300)"
                style={{ transformBox: "fill-box", transformOrigin: "50% 24%" }}
              />
            )}
          </g>
        </g>
      ) : null}

      {/* Bevel: the top face's front edge and an inset on the front face. */}
      <g fill="none" stroke="var(--surface)" strokeLinejoin="round">
        <polyline points="48,40 192,40" strokeOpacity=".55" strokeWidth="1.5" />
        <polygon points="60,48 180,48 206,116 34,116" strokeOpacity=".3" strokeWidth="1.2" />
      </g>

      {animated ? (
        <g clipPath={url("top")}>
          <g data-ingot-part="glint" opacity="0">
            <rect x="20" y="8" width="22" height="38" fill={url("shine")} transform="skewX(-20)" />
          </g>
        </g>
      ) : null}

      <polygon
        points={MOULD}
        fill="none"
        stroke="var(--gold-700)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {marks.map((pct) => {
        const y = levelY(pct / 100);
        const x = mouldRightX(y) + 4;
        return (
          <line
            key={pct}
            data-ingot-mark={pct}
            x1={x}
            x2={x + 9}
            y1={y}
            y2={y}
            stroke="var(--ink-2)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
