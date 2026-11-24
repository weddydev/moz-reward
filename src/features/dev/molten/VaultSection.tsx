"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { GoldVault } from "@/components/ui/GoldVault";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { RewardUnlocked } from "@/components/ui/RewardUnlocked";
import { POUR } from "@/lib/motion/ingot";
import { celebrate } from "@/lib/motion/press";
import { VAULT } from "@/lib/motion/vault";
import { GhostArrow } from "./LabSection";

const MAX = 1_000;
const START = 720;
/** The reference's sample code. */
const CODE = "481927";

/**
 * The reference's Gold Vault (`#vault`) on `/dev/molten`, beside the phone, built from the production
 * `GoldVault`, `RewardUnlocked` and `RedeemCode` and driven by the reference's demo buttons: "Add a visit (+80)"
 * pours 80 gold (the label rolls to "Pouring…" for 1.1 s), "Fill the vault" pours to the top in 1.5 s, which
 * unlocks the reward (rays, ring, lift, leaves, coins, card, toast); "Reset" drains back to 720. Redeem shows the
 * code 320 ms after the press with a 15-minute countdown (the demo's "server" is this page's clock). Like the
 * reference, the buttons do nothing while a pour runs.
 */
export function VaultSection(): React.JSX.Element {
  const [gold, setGold] = useState(START);
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState<{ expiresAt: number; serverNow: number } | null>(null);
  const busy = useRef(false);
  const timer = useRef(0);

  const pour = (to: number): void => {
    if (busy.current || gold >= MAX) return;
    busy.current = true;
    setGold(Math.min(MAX, to));
  };

  return (
    <GoldVault
      parity="vault"
      parityReward="reward"
      shop={{ name: "Brew & Bloom", logoUrl: "/demo/shops/brew-logo.jpg" }}
      title="Free coffee & cake"
      gold={gold}
      size={MAX}
      perVisit={POUR.demoVisitGold}
      seenKey="dev-molten-vault"
      unlocked={unlocked}
      onFull={() => {
        setUnlocked(true);
      }}
      onLanded={() => {
        busy.current = false;
      }}
      unoptimized
      reward={
        <RewardUnlocked
          detail="Free coffee & cake · Brew & Bloom Café"
          imageUrl="/demo/shops/brew-offer2.jpg"
          celebrate
          toastText="Reward unlocked: free coffee & cake"
          unoptimized
        >
          {code ? (
            <RedeemCode code={CODE} expiresAt={code.expiresAt} serverNow={code.serverNow} />
          ) : (
            <div className="m-code">
              <Button
                size={46}
                resultLabel="Show at the till"
                onClick={(e) => {
                  celebrate(e.currentTarget, e, 0);
                  window.clearTimeout(timer.current);
                  timer.current = window.setTimeout(() => {
                    const now = Date.now();
                    setCode({ expiresAt: now + VAULT.redeem.validMs, serverNow: now });
                  }, VAULT.redeem.codeDelayMs);
                  return false; // sparks only: the label doesn't roll (the reference's Redeem)
                }}
              >
                Redeem
              </Button>
            </div>
          )}
        </RewardUnlocked>
      }
    >
      <div className="m-v-btns">
        <Button
          size={46}
          resultLabel="Pouring…"
          resultMs={1_100}
          onClick={() => {
            if (busy.current || gold >= MAX) return false;
            pour(gold + POUR.demoVisitGold);
            return true;
          }}
        >
          Add a visit (+80)
        </Button>
        <Button
          data-parity="orbit-button"
          variant="orbit"
          size={46}
          onClick={() => {
            pour(MAX);
          }}
        >
          Fill the vault
        </Button>
        <Button
          data-parity="ghost-button"
          variant="ghost"
          size={46}
          icon={<GhostArrow />}
          onClick={() => {
            if (busy.current) return;
            window.clearTimeout(timer.current);
            setUnlocked(false);
            setCode(null);
            setGold(START);
          }}
        >
          Reset
        </Button>
      </div>
    </GoldVault>
  );
}
