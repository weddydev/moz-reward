import { useId } from "react";
import { cx } from "@/lib/cx";
import { INGOT_BOX, ingotFill, levelY, mouldRightX } from "@/lib/loyalty/ingot";

/**
 * The gold ingot (DESIGN §8.3; P1-08, the reference's `#ingot` since PD-10): its shadow, the top face, the
 * mould, the liquid clipped to the mould with a wave on its surface, and the outline, path for path and stop for
 * stop as the reference. This is the static picture, safe in server components; `IngotPour` (src/components/motion)
 * animates the same parts and always comes to rest on exactly this.
 * Accessible as one image: "720 of 1,000 gold, 72%" (or `decorative` when the text beside it says it all).
 * Empty → an empty mould, no liquid; full → the top face turns gold (`topGold`, default: when full).
 */
export type IngotProps = {
  gold: number;
  size: number;
  /** Milestone percents, drawn as ticks beside the mould (the settings preview). */
  marks?: readonly number[];
  decorative?: boolean;
  /** Adds the pour's stream and glint (hidden at rest) and the wave's motion; only `IngotPour` sets it. */
  animated?: boolean;
  /** The top face in gold (the reference's unlocked vault). Defaults to a full ingot. */
  topGold?: boolean;
  className?: string;
};

/** The reference's surface: 19 half-waves of 40 units, ±6, wide enough to drift one 80-unit period. */
const WAVE =
  "M-320 0 Q-300 -6 -280 0 T-240 0 T-200 0 T-160 0 T-120 0 T-80 0 T-40 0 T0 0 T40 0 T80 0 T120 0 T160 0 T200 0 T240 0 T280 0 T320 0 T360 0 T400 0 T440 0 V220 H-320 Z";
const MOULD = "M70 62 L250 62 L292 182 L28 182 Z";
const TOP_FACE = "M84 40 L236 40 L250 62 L70 62 Z";

export function Ingot({
  gold,
  size,
  marks = [],
  decorative = false,
  animated = false,
  topGold,
  className,
}: IngotProps): React.JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = ingotFill(gold, size);
  const level = levelY(fill.fraction);
  const url = (name: string): string => `url(#${id}-${name})`;
  const gilded = topGold ?? fill.fraction >= 1;
  return (
    <svg
      viewBox={`0 0 ${String(INGOT_BOX.width)} ${String(INGOT_BOX.height)}`}
      className={cx("block h-auto w-full overflow-visible", className)}
      data-ingot=""
      data-percent={fill.percent}
      {...(decorative
        ? { "aria-hidden": true, focusable: false }
        : { role: "img", "aria-label": fill.label })}
    >
      <defs>
        <linearGradient id={`${id}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--ingot-liquid-0)" />
          <stop offset=".3" stopColor="var(--ingot-liquid-1)" />
          <stop offset=".6" stopColor="var(--ingot-liquid-2)" />
          <stop offset="1" stopColor="var(--ingot-liquid-3)" />
        </linearGradient>
        <linearGradient id={`${id}-mould`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ingot-mould-0)" />
          <stop offset="1" stopColor="var(--ingot-mould-1)" />
        </linearGradient>
        {animated ? (
          <>
            {/* On a vertical line (no width) this bounding-box gradient paints nothing in either engine, as in the
                reference: the visible stream is the flowing dash. Kept verbatim so both draw the same. */}
            <linearGradient id={`${id}-stream`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--ingot-stream-0)" />
              <stop offset=".5" stopColor="var(--ingot-stream-1)" />
              <stop offset="1" stopColor="var(--ingot-stream-2)" />
            </linearGradient>
            <linearGradient id={`${id}-glint`} x1="0" x2="1">
              <stop offset="0" stopColor="var(--ingot-glint)" stopOpacity="0" />
              <stop offset=".5" stopColor="var(--ingot-glint)" stopOpacity=".8" />
              <stop offset="1" stopColor="var(--ingot-glint)" stopOpacity="0" />
            </linearGradient>
          </>
        ) : null}
        <clipPath id={`${id}-clip`}>
          <path d={MOULD} />
        </clipPath>
      </defs>

      <ellipse cx="160" cy="194" rx="146" ry="10" fill="var(--ingot-shadow)" fillOpacity=".16" />
      <path
        data-ingot-part="top"
        d={TOP_FACE}
        fill={gilded ? url("liquid") : "var(--ingot-top)"}
        stroke="var(--ingot-top-edge)"
        strokeOpacity=".5"
      />
      <path d={MOULD} fill={url("mould")} />

      {/* The pour stream: under the liquid, so its foot always meets the surface (the reference moves the line's
          end with the level every frame; here the liquid covers what is below it, and nothing runs per frame). */}
      {animated ? (
        <g data-ingot-part="stream" opacity="0">
          <line
            x1="160"
            y1="-30"
            x2="160"
            y2={INGOT_BOX.bottom}
            stroke={url("stream")}
            strokeWidth="9"
            strokeLinecap="round"
          />
          <line
            className="m-ingot-flow"
            x1="160"
            y1="-30"
            x2="160"
            y2={INGOT_BOX.bottom}
            stroke="var(--ingot-flow)"
            strokeOpacity=".7"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ) : null}

      {fill.fraction > 0 ? (
        <g clipPath={url("clip")}>
          <g data-ingot-part="fill" style={{ transform: `translateY(${String(level)}px)` }}>
            <g data-ingot-part="wave" className={animated ? "m-ingot-wave" : undefined}>
              <path d={WAVE} fill={url("liquid")} />
            </g>
          </g>
          {animated ? (
            <rect
              data-ingot-part="glint"
              x="-80"
              y="40"
              width="46"
              height="170"
              fill={url("glint")}
              transform="skewX(-20)"
              opacity="0"
            />
          ) : null}
        </g>
      ) : null}

      <path
        d={MOULD}
        fill="none"
        stroke="var(--ingot-outline)"
        strokeWidth="2"
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
