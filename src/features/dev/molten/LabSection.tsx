"use client";

import { useState } from "react";
import { MoltenHeart } from "@/components/icons/molten-heart";
import { CountUp } from "@/components/motion/CountUp";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { LiquidChoice } from "@/components/ui/LiquidChoice";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { Tile } from "@/components/ui/Tile";
import { toast } from "@/components/ui/Toast";
import { TABS } from "@/lib/motion/controls";

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
  const [alerts, setAlerts] = useState(true);
  const [happyHour, setHappyHour] = useState(false);
  const [reward, setReward] = useState<(typeof REWARDS)[number]["value"]>("coffee");
  const [tab, setTab] = useState<(typeof TAB_ITEMS)[number]["value"]>("wallet");
  const panel = TAB_PANELS[tab];
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

        <Tile data-parity="coin-switch-tile" className="m-w5">
          <div className="m-t-head">
            <h3>Coin switch</h3>
            <span className="m-chip">700 ms spring</span>
          </div>
          <div className="m-demo m-demo-rows">
            <Switch
              parity="coin-switch"
              label="Points approved alerts"
              description="When a shop approves your visit"
              checked={alerts}
              onCheckedChange={setAlerts}
            />
            <Switch
              label="Happy hour near me"
              description="Within 1 mile of Camden"
              checked={happyHour}
              onCheckedChange={setHappyHour}
            />
          </div>
          <p className="m-how">
            The knob is a coin. It <b>rolls</b> across, <b>flips</b> to a tick, liquid gold{" "}
            <b>pours</b> in behind it and it lands with a spark and a pulse. Off drains it back.
          </p>
        </Tile>

        <Tile data-parity="liquid-choice-tile" className="m-w6">
          <div className="m-t-head">
            <h3>Liquid choice</h3>
            <span className="m-chip">radio · 640 ms</span>
          </div>
          <div className="m-demo">
            <LiquidChoice
              parity="liquid-choice"
              label="Choose your reward"
              options={REWARDS}
              value={reward}
              onChange={setReward}
            />
          </div>
          <p className="m-how">
            The selection is a drop of liquid gold. It <b>stretches</b>, splits off droplets and{" "}
            <b>pours</b> into the new choice, then wobbles to rest. Arrow keys work.
          </p>
        </Tile>

        <Tile data-parity="seal-checkbox-tile" className="m-w6">
          <div className="m-t-head">
            <h3>Gold seal checkbox</h3>
            <span className="m-chip">480 ms</span>
          </div>
          <div className="m-demo">
            <div className="m-chks">
              <Checkbox
                parity="seal-checkbox"
                label="Email me new offers from my shops"
                defaultChecked
              />
              <Checkbox parity="seal-checkbox-on" label="Remind me when a reward is close" />
              <Checkbox label="Monthly recap of my gold" />
            </div>
          </div>
          <p className="m-how">
            Pressed like a wax seal: the box <b>squashes and pops</b>, gold{" "}
            <b>floods from the centre</b>, the tick draws itself, a ring and sparks fly off.
          </p>
        </Tile>

        <Tile data-parity="tabs-tile">
          <div className="m-t-head">
            <h3>Tabs</h3>
            <span className="m-chip">spring + trail</span>
          </div>
          <div className="m-demo m-demo-col">
            <Tabs parity="tabs" label="Sections" items={TAB_ITEMS} value={tab} onChange={setTab}>
              <div key={tab} className="m-tab-demo">
                <CountUp className="m-big" value={panel.n} ms={TABS.countUpMs} />
                <p>{panel.text}</p>
              </div>
            </Tabs>
          </div>
          <p className="m-how">
            A gold pill springs across with a <b>light trail</b> behind it; content slides in from
            the direction you moved and the number <b>counts up</b>.
          </p>
        </Tile>
      </div>
    </section>
  );
}

const REWARDS = [
  { value: "coffee", label: "Coffee", detail: "600 gold" },
  { value: "cake", label: "Cake", detail: "800 gold" },
  { value: "both", label: "Both", detail: "1,000 gold" },
] as const;

const TAB_ITEMS = [
  { value: "wallet", label: "Wallet" },
  { value: "offers", label: "Offers" },
  { value: "market", label: "Market" },
] as const;

const TAB_PANELS: Record<(typeof TAB_ITEMS)[number]["value"], { n: number; text: string }> = {
  wallet: { n: 2480, text: "gold across 3 shops" },
  offers: { n: 12, text: "live drops near Camden" },
  market: { n: 48, text: "new listings this week" },
};
