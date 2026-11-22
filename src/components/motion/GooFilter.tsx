import { LIQUID } from "@/lib/motion/controls";

/** The goo filter's id: `.m-goo { filter: url(#m-goo) }` (molten.css). */
export const GOO_ID = "m-goo";

/**
 * The goo filter (PD-05; reference `#goo`), defined once in the root layout for every liquid indicator (liquid
 * choice, segmented control, the dock in PD-07): blur the gold, then cut its alpha to a hard edge so drops that
 * touch merge like liquid. A zero-size, hidden SVG; the lite tier drops the filter in CSS (`.lite .m-goo`). WebKit keeps it (DECISIONS
 * 22 Nov "PD-05 WebKit goo").
 */
export function GooFilter(): React.JSX.Element {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute" }}
      data-goo=""
    >
      <defs>
        <filter id={GOO_ID} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={LIQUID.gooBlur} result="b" />
          <feColorMatrix
            in="b"
            mode="matrix"
            values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${LIQUID.gooAlpha}`}
            result="g"
          />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
