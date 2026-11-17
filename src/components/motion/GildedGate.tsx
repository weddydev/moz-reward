import "./gilded-gate.css";
import { initialsOf } from "@/lib/initials";
import { GATE, gateOutlinePaths, gateScript } from "@/lib/motion/gilded-gate";
import { GildedGateLoader } from "./GildedGateLoader";

/**
 * Gilded Gate (P1-03, DESIGN §8.1): server-rendered only for `src=qr|nfc`, before the landing content so its
 * pre-paint script runs before any of the page is painted. Hidden unless that script plays it (see
 * `src/lib/motion/gilded-gate.ts`). Decorative and `aria-hidden`: the shop's name is the page's own h1, and
 * nothing in it takes focus. The page's `[data-gate-cover]` is the morph target; `[data-gate-rise]` items rise
 * with a 40ms stagger as it lands (`--rise-i`).
 */
export function GildedGate({
  code,
  name,
  logoUrl,
  nonce,
}: {
  code: string;
  name: string;
  logoUrl: string | null;
  nonce: string | undefined;
}): React.JSX.Element {
  const { width, height, radius, stroke } = GATE.frame;
  const [left, right] = gateOutlinePaths(width, height, radius, stroke / 2);
  return (
    <>
      {/* suppressHydrationWarning: the pre-paint script sets data-state before React hydrates. */}
      <div
        id={GATE.id}
        className="gilded-gate"
        aria-hidden="true"
        data-testid="gilded-gate"
        suppressHydrationWarning
      >
        <div className="gate-bg" />
        <div className="gate-stage">
          <div className="gate-frame" data-gate-frame="">
            <span className="gate-glow" />
            <svg
              className="gate-outline"
              viewBox={`0 0 ${String(width)} ${String(height)}`}
              width={width}
              height={height}
              focusable="false"
            >
              <path d={left} pathLength={1} />
              <path d={right} pathLength={1} />
            </svg>
            <span className="gate-logo">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- CDN variant, same as the landing logo
                <img
                  src={logoUrl}
                  alt=""
                  width={80}
                  height={80}
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-h2 text-ink">{initialsOf(name)}</span>
              )}
            </span>
            <span className="gate-shimmer" />
          </div>
          <p className="gate-welcome font-display text-h2 text-ink">Welcome to {name}</p>
        </div>
      </div>
      <script
        nonce={nonce}
        suppressHydrationWarning
        // eslint-disable-next-line react/no-danger -- our own script; the only data is the JSON-escaped shop code
        dangerouslySetInnerHTML={{ __html: gateScript(code) }}
      />
      <GildedGateLoader />
    </>
  );
}
