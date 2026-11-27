import "./gilded-gate.css";
import { CoverArt } from "@/components/ui/CoverArt";
import {
  GATE,
  gateMorphScript,
  gateSceneScript,
  gateScript,
  gateTimeline,
  gateTitle,
  type GateTimeline,
} from "@/lib/motion/gilded-gate";
import { GateScene } from "./GateScene";
import { GildedGateLoader } from "./GildedGateLoader";

/** The per-name timeline and the CSS custom properties that carry it (on a wrapper round gate and page). */
export function gateTimelineFor(name: string): GateTimeline {
  return gateTimeline(gateTitle(name).letters);
}

export function gateVars(t: GateTimeline): React.CSSProperties {
  return {
    "--gate-total": `${String(t.totalMs)}ms`,
    "--gate-handoff": `${String(t.handoffMs)}ms`,
  } as React.CSSProperties;
}

/**
 * Gilded Gate 2.0 (P1-03, PD-09, DESIGN §8.1): server-rendered only for `src=qr|nfc`, before the landing content
 * so its pre-paint script runs before any of the page is painted. Hidden unless that script plays it (see
 * `src/lib/motion/gilded-gate.ts`); the scene script right after it starts the reference timeline (canvas
 * particles + Web Animations) during parse. Decorative and `aria-hidden`: the shop's name is the page's own h1,
 * and nothing in it takes focus. The page's `[data-gate-cover]` is the morph target (the cover grows out of the
 * coin at the hand-off); `[data-gate-rise]` items rise with a 40ms stagger as it lands (`--rise-i`).
 * `GildedGateMorph` goes after the landing content; the page wraps both in `gateVars(timeline)`.
 */
export function GildedGate({
  code,
  name,
  sub,
  logoUrl,
  coverUrl,
  timeline,
  nonce,
}: {
  code: string;
  name: string;
  sub: string;
  logoUrl: string | null;
  coverUrl: string | null;
  timeline: GateTimeline;
  nonce: string | undefined;
}): React.JSX.Element {
  return (
    <>
      {/* suppressHydrationWarning: the pre-paint script sets data-state before React hydrates. */}
      <div
        id={GATE.id}
        className="gilded-gate"
        data-gate-host=""
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
          <GateScene name={name} sub={sub} logoUrl={logoUrl} />
        </div>
      </div>
      <script
        nonce={nonce}
        suppressHydrationWarning
        // eslint-disable-next-line react/no-danger -- our own script; the only data is the JSON-escaped shop code
        dangerouslySetInnerHTML={{ __html: gateScript(code) }}
      />
      <script
        nonce={nonce}
        suppressHydrationWarning
        // eslint-disable-next-line react/no-danger -- our own functions' source + numeric timings, no request data
        dangerouslySetInnerHTML={{ __html: gateSceneScript(timeline) }}
      />
      <GildedGateLoader />
    </>
  );
}

/**
 * The hand-off morph (P1-03): an inline script placed after the landing markup, so it runs during parse, before
 * any framework JavaScript, and is ready long before the hand-off even on a slow phone.
 */
export function GildedGateMorph({
  timeline,
  nonce,
}: {
  timeline: GateTimeline;
  nonce: string | undefined;
}): React.JSX.Element {
  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      // eslint-disable-next-line react/no-danger -- our own functions' source + numeric config, no request data
      dangerouslySetInnerHTML={{ __html: gateMorphScript(timeline.handoffMs) }}
    />
  );
}
