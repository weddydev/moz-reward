"use client";

import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ReadyRewardView } from "./view";

const loadSheet = () => import("./RedeemSheet");
const RedeemSheet = lazy(loadSheet);

/**
 * "Rewards ready" with Redeem (P1-16): the Wallet's right column (every shop, C-65) and the Gold Vault's card (one
 * shop, C-67). Each Redeem opens the same redeem flow in a sheet; the sheet's chunk loads on press or focus.
 */
export function RewardsReady({
  rewards,
  showShop,
}: {
  rewards: readonly ReadyRewardView[];
  /** The Wallet names the shop on each row; the Vault is one shop's already. */
  showShop: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState<ReadyRewardView | null>(null);
  const [shown, setShown] = useState<ReadyRewardView | null>(null);
  return (
    <>
      <ul className="flex flex-col gap-3" data-testid="rewards-ready-list">
        {rewards.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3"
            data-testid="reward-ready"
          >
            <div className="min-w-0">
              <p className="text-body truncate font-semibold">{r.label}</p>
              {showShop ? <p className="text-small text-ink-2 truncate">{r.shopName}</p> : null}
              <p className="text-small text-ink-2">{r.validUntil}</p>
            </div>
            <Button
              size={46}
              variant="orbit"
              onPointerDown={() => {
                void loadSheet();
              }}
              onFocus={() => {
                void loadSheet();
              }}
              onClick={() => {
                setShown(r);
                setOpen(r);
              }}
              aria-label={`Redeem ${r.label}`}
              data-testid="reward-redeem"
            >
              Redeem
            </Button>
          </li>
        ))}
      </ul>
      {shown ? (
        <Suspense fallback={null}>
          <RedeemSheet
            key={shown.id}
            reward={shown}
            open={open !== null}
            onClose={() => {
              setOpen(null);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
