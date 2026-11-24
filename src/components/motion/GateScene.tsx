import { Fragment } from "react";
import { initialsOf } from "@/lib/initials";
import { gateTitle } from "@/lib/motion/gilded-gate";

/**
 * Gilded Gate 2.0's scene (PD-09, DESIGN §8.1): the reference intro's stage content, element for element (rays,
 * glow, two 3D orbit rings, the night canvas, the coin, flash, shockwave, the welcome line), so curve parity can
 * compare them in document order. Shared by the real gate (`GildedGate`) and the /dev/molten stage. Nothing
 * here moves on its own: `playGateScene` plays it, and the CSS (`gilded-gate.css`) holds the hidden and rest
 * states. Decorative: the host is `aria-hidden` (the page has its own h1 with the shop's name).
 *
 * The coin frames the shop's logo photo in the metal rim; without a logo it carries the shop's initials.
 */
export function GateScene({
  name,
  sub,
  logoUrl,
}: {
  name: string;
  sub: string;
  logoUrl: string | null;
}): React.JSX.Element {
  const title = gateTitle(name);
  let index = 0;
  return (
    <>
      <div className="gate-rays" />
      <div className="gate-glow" />
      <div className="gate-orbits" aria-hidden="true">
        <div className="gate-orbit">
          <div className="gate-spin">
            <b />
            <b />
          </div>
        </div>
        <div className="gate-orbit gate-o2">
          <div className="gate-spin">
            <b />
          </div>
        </div>
      </div>
      <canvas className="gate-night" data-gate-canvas="" aria-hidden="true" />
      <svg
        className="gate-coin"
        data-gate-frame=""
        viewBox="0 0 200 200"
        focusable="false"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="gate-coin-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--gate-coin-0)" }} />
            <stop offset=".3" style={{ stopColor: "var(--gate-coin-1)" }} />
            <stop offset=".55" style={{ stopColor: "var(--gate-coin-2)" }} />
            <stop offset=".8" style={{ stopColor: "var(--gate-coin-3)" }} />
            <stop offset="1" style={{ stopColor: "var(--gate-rim)" }} />
          </linearGradient>
          <linearGradient id="gate-shine-g" x1="0" x2="1">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset=".5" stopColor="white" stopOpacity=".85" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <clipPath id="gate-coin-clip">
            <circle cx="100" cy="100" r="96" />
          </clipPath>
          <clipPath id="gate-inner-clip">
            <circle cx="100" cy="100" r="78" />
          </clipPath>
        </defs>
        <circle cx="100" cy="100" r="96" fill="url(#gate-coin-g)" />
        <circle
          cx="100"
          cy="100"
          r="96"
          fill="none"
          style={{ stroke: "var(--gate-rim)" }}
          strokeWidth="4"
        />
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          style={{ stroke: "var(--gate-rim-light)" }}
          strokeOpacity=".8"
          strokeWidth="2"
        />
        {logoUrl ? (
          <image
            href={logoUrl}
            x="22"
            y="22"
            width="156"
            height="156"
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#gate-inner-clip)"
          />
        ) : (
          <text
            className="gate-initials"
            x="100"
            y="100"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {initialsOf(name)}
          </text>
        )}
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          style={{ stroke: "var(--gate-rim)" }}
          strokeOpacity=".7"
          strokeWidth="1.5"
        />
        <g clipPath="url(#gate-coin-clip)">
          <rect
            className="gate-coin-shine"
            x="-60"
            y="-20"
            width="60"
            height="240"
            fill="url(#gate-shine-g)"
            transform="skewX(-18)"
          />
        </g>
      </svg>
      <div className="gate-flash" />
      <div className="gate-shock" />
      <div
        className="gate-welcome"
        style={{ "--gate-em": String(Math.max(1, title.longestEm)) } as React.CSSProperties}
      >
        <p className="gate-pre">Welcome to</p>
        <p className="gate-title">
          {title.words.map((word, wi) => (
            <Fragment key={wi}>
              {wi > 0 ? " " : null}
              <span className="gate-word">
                {word.map((ch) => {
                  const i = index++;
                  return (
                    <span
                      key={i}
                      className="gate-ch"
                      style={{
                        backgroundPosition: `${String(100 - (i / title.letters) * 40)}% 0`,
                      }}
                    >
                      {ch}
                    </span>
                  );
                })}
              </span>
            </Fragment>
          ))}
        </p>
        <p className="gate-sub">{sub}</p>
      </div>
    </>
  );
}
