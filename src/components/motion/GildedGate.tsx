import "./gilded-gate.css";
import { CoverArt } from "@/features/landing/ShopLanding";
import { initialsOf } from "@/lib/initials";
import { GATE, gateMorphScript, gateOutlinePaths, gateScript } from "@/lib/motion/gilded-gate";
import { GildedGateLoader } from "./GildedGateLoader";

/**
 * Gilded Gate (P1-03, DESIGN §8.1): server-rendered only for `src=qr|nfc`, before the landing content so its
 * pre-paint script runs before any of the page is painted. Hidden unless that script plays it (see
 * `src/lib/motion/gilded-gate.ts`). Decorative and `aria-hidden`: the shop's name is the page's own h1, and
 * nothing in it takes focus. The page's `[data-gate-cover]` is the morph target; `[data-gate-rise]` items rise
 * with a 40ms stagger as it lands (`--rise-i`). `GildedGateMorph` goes after the landing content.
 */
export function GildedGate({
  code,
  name,
  logoUrl,
  coverUrl,
  nonce,
}: {
  code: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
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
        {/* The morph's cover copy, server-rendered so the inline script never changes the DOM React hydrates:
            it only sizes it (style) and animates it (WAAPI). Hidden until then. */}
        <div className="gate-panel" data-gate-panel="" suppressHydrationWarning>
          <div className="gate-art" suppressHydrationWarning>
            <CoverArt coverUrl={coverUrl} />
          </div>
        </div>
        <div className="gate-stage">
          {/* The frame is exactly centred; the welcome line hangs below it, so a late font swap can't move it. */}
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

/**
 * Step 4's morph (P1-03): an inline script placed after the landing markup, so it runs during parse, before
 * any framework JavaScript, and is ready long before 1000ms even on a slow phone.
 */
export function GildedGateMorph({ nonce }: { nonce: string | undefined }): React.JSX.Element {
  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      // eslint-disable-next-line react/no-danger -- our own functions' source + numeric config, no request data
      dangerouslySetInnerHTML={{ __html: gateMorphScript() }}
    />
  );
}
