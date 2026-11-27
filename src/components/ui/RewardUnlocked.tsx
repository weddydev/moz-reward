"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { burst } from "@/lib/motion/fx";
import { cardKeyframes, VAULT } from "@/lib/motion/vault";
import { ShopImage } from "./ShopImage";
import { toast } from "./Toast";

/**
 * The reward card of an unlocked vault (DESIGN §8.4 v2; PD-10, reference `.reward`, `.reward-card`, `.r-left`,
 * `.r-img`): obsidian, the reward's photo, "Your reward is ready" and what it is, and the redeem slot (`children`:
 * the Redeem button, then the `RedeemCode`). With `celebrate` it arrives as the reference's moment: it flips in
 * from rotateX 80° (700 ms after 350 ms), 70 gold leaves fall from the top of the vault and the toast says so.
 * The light rays, the ring pulse, the ingot lift and the coin burst belong to `GoldVault` and `IngotPour`.
 * Reduced motion: the card fades in, nothing falls. Visual only until P1-15 wires it to a real reward.
 */
export function RewardUnlocked({
  detail,
  imageUrl,
  celebrate = false,
  testId = "reward-card",
  toastText,
  unoptimized = false,
  children,
}: {
  /** What the reward is and where: "Free coffee & cake · Brew & Bloom Café". */
  detail: string;
  imageUrl: string | null;
  celebrate?: boolean;
  /** A still placeholder copy names itself apart (the celebration's reserved slot, P1-D close). */
  testId?: string;
  /** The toast when it arrives ("Reward unlocked: free coffee & cake"). */
  toastText?: string;
  unoptimized?: boolean;
  children?: ReactNode;
}): React.JSX.Element {
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = card.current;
    if (!celebrate || !el) return;
    const c = VAULT.unlock.card;
    const reduced = reducedMotionNow();
    anim(el, reduced ? [{ opacity: 0 }, { opacity: 1 }] : cardKeyframes(), {
      duration: c.ms,
      delay: c.delayMs,
    });
    const vault = el.closest(".m-vault") ?? el;
    const r = vault.getBoundingClientRect();
    const l = VAULT.unlock.leaves;
    burst(r.left + r.width / 2, r.top + 10, {
      type: "leaf",
      count: l.count,
      speed: l.speed,
      angle: Math.PI / 2,
      spread: l.spread,
      jx: r.width / 2,
      gravity: l.gravity,
    });
    if (toastText) toast(toastText);
    // Once per arrival: the parent mounts a new card for each unlock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="m-reward-card" ref={card} data-testid={testId}>
      <div className="m-r-left">
        {imageUrl ? (
          <ShopImage src={imageUrl} size={56} className="m-r-img" unoptimized={unoptimized} eager />
        ) : null}
        <div>
          <h3>Your reward is ready</h3>
          <p>{detail}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
