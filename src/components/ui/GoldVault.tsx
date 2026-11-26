"use client";

import { type ReactNode, useRef, useState } from "react";
import { GildedEdge } from "@/components/motion/GildedEdge";
import { IngotPour } from "@/components/motion/IngotPour";
import { usePauseOffscreen } from "@/components/motion/usePauseOffscreen";
import { formatCount } from "@/lib/motion/press";
import { goldToGo } from "@/lib/motion/vault";
import { ShopCoin, ShopImage } from "./ShopImage";

/**
 * The Gold Vault (DESIGN §8.3–8.4 v2; PD-10, reference `.vault`, `.v-bg`, `.v-rays`, `.v-head`, `.v-count`): a
 * placed ivory card with the gilded edge; the header with the shop's logo ("Gold Vault · <shop>"), the reward
 * the ingot is for, how much is left, and the count; the pouring ingot; `children` (actions under it); and,
 * once `unlocked`, the reward card (`reward`, a `RewardUnlocked`).
 * Unlocking after mount plays the reward moment: light rays fade in behind the vault, and `IngotPour` lifts the
 * ingot with the ring pulse and the coin burst (the card's flip, leaves and toast are `RewardUnlocked`'s, given
 * `celebrate` by the caller). At load an unlocked vault simply shows it. `onFull` is the ingot reaching the top;
 * the caller decides whether that unlocks (P1-15 wires it to the real reward).
 */
export function GoldVault({
  shop,
  title,
  gold,
  size,
  ingots = 0,
  perVisit,
  owed = 0,
  seenKey,
  unlocked = false,
  still = false,
  skipKey = 0,
  onFull,
  onLanded,
  reward,
  children,
  parity,
  parityReward,
  unoptimized = false,
}: {
  shop: { name: string; logoUrl: string | null };
  /** The reward this ingot is for ("Free coffee & cake"). */
  title: string;
  gold: number;
  size: number;
  ingots?: number;
  /** Gold a usual visit earns, for "about N visits" (left out when unknown). */
  perVisit?: number;
  /** Gold owed from a reversal (P1-12): added to the gold still to go. */
  owed?: number;
  seenKey: string;
  unlocked?: boolean;
  /** P1-15: show the level as it is on the first view (no pour); later gold still pours (`IngotPour`). */
  still?: boolean;
  /** P1-15: a change lands the running pour at once (`IngotPour`). */
  skipKey?: number;
  onFull?: () => void;
  /** Each time a pour lands, with the gold it shows. */
  onLanded?: (gold: number) => void;
  reward?: ReactNode;
  children?: ReactNode;
  /** `data-parity` names for /dev/molten (the vault, and the reward card's slot). */
  parity?: string;
  parityReward?: string;
  unoptimized?: boolean;
}): React.JSX.Element {
  const count = useRef<HTMLSpanElement>(null);
  // The rays' 40 s loop (and every other loop inside) sleeps off screen or in a hidden tab (FOLLOWUPS L5).
  const section = useRef<HTMLElement>(null);
  usePauseOffscreen(section);
  // The line under the title follows the liquid: it changes when a pour lands, not when the gold arrives.
  // Less gold (a reset, a new ingot) shows at once.
  const [landed, setLanded] = useState(gold);
  const [lastGold, setLastGold] = useState(gold);
  if (gold !== lastGold) {
    setLastGold(gold);
    if (gold < landed) setLanded(gold);
  }
  const line = goldToGo(Math.min(landed, gold), size, perVisit, owed);
  return (
    <section
      ref={section}
      className="m-vault"
      data-unlocked={unlocked ? "" : undefined}
      data-parity={parity}
      data-testid="gold-vault"
      aria-label={`Gold Vault, ${shop.name}`}
    >
      <div className="m-v-bg" aria-hidden="true">
        <div className="m-v-rays" />
      </div>
      <div className="m-v-head">
        <div>
          <p className="m-eyebrow m-v-shop">
            {shop.logoUrl ? (
              <ShopImage
                src={shop.logoUrl}
                size={30}
                className="m-v-logo"
                unoptimized={unoptimized}
                eager
              />
            ) : (
              <span className="m-v-logo">
                <ShopCoin name={shop.name} size={30} />
              </span>
            )}
            Gold Vault · {shop.name}
          </p>
          <h2 className="m-v-title">{title}</h2>
          <p className="m-v-msg" data-testid="vault-line">
            {line}
          </p>
        </div>
        <p className="m-v-count">
          <span ref={count}>{formatCount(gold)}</span> <small>/ {formatCount(size)}</small>
        </p>
      </div>
      <IngotPour
        gold={gold}
        size={size}
        ingots={ingots}
        seenKey={seenKey}
        unlocked={unlocked}
        still={still}
        skipKey={skipKey}
        onFull={onFull}
        onLanded={(g) => {
          setLanded(g);
          onLanded?.(g);
        }}
        count={count}
      />
      {children}
      {unlocked && reward ? (
        <div className="m-reward" data-parity={parityReward}>
          {reward}
        </div>
      ) : null}
      <GildedEdge />
    </section>
  );
}
