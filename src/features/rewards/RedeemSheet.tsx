"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Modal } from "@/components/ui/Modal";
import { RewardUnlocked } from "@/components/ui/RewardUnlocked";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { RedeemFlow } from "./RedeemFlow";
import type { ReadyRewardView } from "./view";

/**
 * Redeem one reward from a list (P1-16; Wallet C-65, Gold Vault C-67): the obsidian reward card (DESIGN §8.4,
 * without the arrival moment) with its redeem slot, in a sheet on phones and a modal from 1024 px. Its own chunk,
 * loaded on the first press. Closing it keeps the code live until it expires; opening it again asks for a new one.
 */
export default function RedeemSheet({
  reward,
  open,
  onClose,
}: {
  reward: ReadyRewardView;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const Overlay = desktop ? Modal : BottomSheet;
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Redeem your reward"
      description={`At the till, show the code to the team at ${reward.shopName}. ${reward.validUntil}.`}
    >
      <div data-testid="redeem-sheet">
        <RewardUnlocked detail={`${reward.label} · ${reward.shopName}`} imageUrl={null}>
          {open ? <RedeemFlow rewardId={reward.id} /> : null}
        </RewardUnlocked>
      </div>
    </Overlay>
  );
}
