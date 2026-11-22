"use client";

import { useState } from "react";
import { MoltenHeart } from "@/components/icons/molten-heart";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Tile } from "@/components/ui/Tile";
import { toast } from "@/components/ui/Toast";

/** The reference's ghost-button arrow (16 px, stroke 2.2). */
export function GhostArrow(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * The reference's Controls lab, rebuilt from production components (PD-04 builds the Buttons tile; PD-05 and
 * PD-06 add theirs). Copy is the reference's, word for word.
 */
export function LabSection(): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  return (
    <section aria-labelledby="m-lab" className="m-lab-section">
      <div className="m-sec-head">
        <div>
          <p className="m-eyebrow">Controls lab · everything here is live</p>
          <h2 className="m-sec" id="m-lab">
            Every click should feel <em>out of this world</em>
          </h2>
        </div>
        <p className="m-lede" style={{ maxWidth: "40ch" }}>
          Press, toggle, drag and type. Try the reduce-motion switch at the top to see the
          accessible version.
        </p>
      </div>
      <div className="m-lab">
        <Tile data-parity="tile" className="m-w7">
          <div className="m-t-head">
            <h3>Buttons</h3>
            <span className="m-chip">press · 650 ms</span>
          </div>
          <div className="m-demo">
            <Button
              data-parity="molten-button"
              resultLabel="+80 gold added"
              celebrate
              onClick={() => {
                toast("80 gold added at Brew & Bloom Café", "success");
              }}
            >
              Collect gold
            </Button>
            <Button variant="orbit">View rewards</Button>
            <Button variant="ghost" icon={<GhostArrow />}>
              Maybe later
            </Button>
            <IconButton
              data-parity="heart-toggle"
              variant="round"
              icon={MoltenHeart}
              label="Save offer"
              pressed={saved}
              onPressedChange={(on) => {
                setSaved(on);
                if (on) toast("Offer saved", "success");
              }}
            />
          </div>
          <p className="m-how">
            <b>Primary:</b> molten gold flows inside, the button leans toward your cursor, light
            follows the pointer, a ripple spreads from your fingertip, sparks and coins burst, the
            label rolls to the result and a toast confirms. <b>Secondary:</b> a beam of light orbits
            the border. <b>Save:</b> a heart that fills with gold and bursts.
          </p>
        </Tile>
      </div>
    </section>
  );
}
