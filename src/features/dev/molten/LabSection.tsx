"use client";

import { useRef, useState } from "react";
import { MoltenHeart } from "@/components/icons/molten-heart";
import { CountUp } from "@/components/motion/CountUp";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { LiquidChoice } from "@/components/ui/LiquidChoice";
import { StarRating } from "@/components/ui/StarRating";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/TextField";
import { Tile } from "@/components/ui/Tile";
import { toast } from "@/components/ui/Toast";
import { BUTTON, TABS } from "@/lib/motion/controls";
import { useHydrated } from "@/lib/use-hydrated";

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
  const [rating, setRating] = useState(0);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [tries, setTries] = useState(0);
  const [sent, setSent] = useState<string | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  // The page can hydrate after the root layout marks <html data-hydrated> (C-20): until this section owns its
  // controls, it says so, and tests wait for no [data-hydrating] before they type or press keys.
  const hydrated = useHydrated();
  return (
    <section
      aria-labelledby="m-lab"
      className="m-lab-section"
      data-hydrating={hydrated ? undefined : ""}
    >
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

        <Tile data-parity="stars-tile">
          <div className="m-t-head">
            <h3>Rate your visit</h3>
            <span className="m-chip">ignite · 70 ms stagger</span>
          </div>
          <div className="m-demo m-demo-col m-demo-start">
            <StarRating parity="stars" value={rating} onChange={setRating} />
          </div>
          <p className="m-how">
            Stars <b>ignite one after another</b> with a spark each. Any rating gets the{" "}
            <b>same two equal choices</b>, so the review rules stay intact.
          </p>
        </Tile>

        <Tile data-parity="text-field-tile" className="m-w5">
          <div className="m-t-head">
            <h3>Input</h3>
            <span className="m-chip">focus · error · success</span>
          </div>
          <div className="m-demo">
            <form
              className="m-fform"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <TextField
                ref={emailInput}
                parity="text-field"
                label="Email address"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(undefined);
                  setSent(null);
                }}
                error={emailError}
                errorKey={tries}
                valid={sent !== null}
              />
              <Button
                type="submit"
                size={46}
                resultLabel="Link sent"
                resultMs={BUTTON.signInBackMs}
                celebrate={{ coins: 0 }}
                onClick={() => {
                  const v = email.trim();
                  if (!EMAIL.test(v)) {
                    setTries((n) => n + 1);
                    setEmailError(
                      v
                        ? "That email looks incomplete. Check it has an @ and a domain, like name@example.co.uk."
                        : "Enter your email address to get a sign-in link.",
                    );
                    setSent(null);
                    emailInput.current?.focus();
                    return false;
                  }
                  setEmailError(undefined);
                  setSent(v);
                  return true;
                }}
              >
                Send sign-in link
              </Button>
              <p className="m-err" aria-live="polite">
                {sent === null ? "" : `Sign-in link sent to ${sent}. It works for 15 minutes.`}
              </p>
            </form>
          </div>
          <p className="m-how">
            A beam of gold runs out <b>from where you tapped</b>. A bad address <b>shakes</b> and
            says how to fix it; a good one draws a tick and sparks.
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

/** The reference's address check (the Input tile). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
