"use client";

import { Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CountUp } from "@/components/motion/CountUp";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { GoldVault } from "@/components/ui/GoldVault";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ReceiptCard } from "@/components/ui/ReceiptCard";
import { RewardUnlocked } from "@/components/ui/RewardUnlocked";
import { RedeemFlow } from "@/features/rewards/RedeemFlow";
import {
  announcement,
  CELEBRATION,
  type Celebration,
  goldText,
  progressLine,
  purchaseLine,
  shareText,
} from "@/lib/celebration";
import { haptic } from "@/lib/haptics";
import { reducedMotionNow } from "@/lib/motion/anim";
import { burst } from "@/lib/motion/fx";
import { play } from "@/lib/sound";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import "./celebration.css";

/** After the exit transition (≤ 300 ms, globals.css), the host unmounts the moment. */
const EXIT_MS = 360;

/** The page's main heading: where focus lands after Done/Esc, since the moment opened with no trigger (P1-D QA). */
const pageHeading = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-route-content] h1");

/** Finishes every finite animation inside `root` (an infinite loop can't be finished; it keeps playing). */
function finishAll(root: Element | null): void {
  if (!root || typeof root.getAnimations !== "function") return;
  for (const a of root.getAnimations({ subtree: true })) {
    if (a.effect?.getComputedTiming().iterations === Infinity) continue;
    try {
      a.finish();
    } catch {
      /* not finishable (no end): leave it */
    }
  }
}

/**
 * "Points credited" (DESIGN §8.2) chaining into "Reward unlocked" (§8.4), P1-15. A sheet on phones, a modal from
 * 1024 px. The ingot shows the level before the award, then pours to the new level (stream, splash, "+N" stamp)
 * while "+80 gold" counts up and shimmers and a few gold particles drift up; credit chime and pulse. A filled
 * ingot (or a milestone reached) then plays the reward moment: rays, ring, lift, coins, the reward card flipping
 * in with gold leaves; reward chime and pattern. Share (gold) and Done; "View receipt" prints the receipt (§8.5).
 * - Skippable: a tap anywhere on the moment lands everything at once. Interruptible: Done, Esc, the backdrop and
 *   a drag close it at any point; nothing waits for an animation.
 * - Reduced motion: the end state with a short fade (the pour, card and print shrink to ≤ 150 ms fades; no
 *   particles). Sounds and haptics follow the user's toggle (`play`, `haptic`).
 * - Everything the animation shows is also in text, and a polite live region says it once.
 * Loaded on demand (its own chunk) by `CelebrationHost` only when there is a moment to play.
 */
export default function CelebrationMoment({
  moment,
  onDone,
}: {
  moment: Celebration;
  onDone: () => void;
}): React.JSX.Element {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const Overlay = desktop ? Modal : BottomSheet;
  const { ingot, shop } = moment;
  const filled = ingot.filled > 0;
  // A fill pours to the top and stays there, lifted, with the reward: the next ingot's level is in the text.
  const target = filled ? ingot.size : Math.min(ingot.size, ingot.to);
  const reward = moment.rewards.find((r) => r.kind === "main") ?? moment.rewards[0] ?? null;
  const rewardDetail = reward
    ? moment.rewards.length > 1
      ? `${reward.label} and ${String(moment.rewards.length - 1)} more · ${shop.name}`
      : `${reward.label} · ${shop.name}`
    : "";

  const [open, setOpen] = useState(true);
  const [gold, setGold] = useState(Math.min(ingot.size, ingot.from));
  const [poured, setPoured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const [skipKey, setSkipKey] = useState(0);
  const [said, setSaid] = useState("");
  const [shared, setShared] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const goldLine = useRef<HTMLParagraphElement>(null);
  const unlockedOnce = useRef(false);
  const printed = useRef<HTMLDivElement>(null);

  // The receipt prints under the vault: bring it into view as it prints (the body scrolls on small screens), and
  // take focus there, since the "View receipt" button that was focused has gone.
  useEffect(() => {
    if (!receipt) return;
    printed.current?.focus({ preventScroll: true });
    printed.current?.scrollIntoView({
      block: "nearest",
      behavior: reducedMotionNow() ? "auto" : "smooth",
    });
  }, [receipt]);

  const unlock = (): void => {
    if (unlockedOnce.current || !reward) return;
    unlockedOnce.current = true;
    setUnlocked(true);
    play("reward");
    haptic("reward");
  };

  const pourTimer = useRef(0);
  const pourStarted = useRef(false);
  /** The gold arrives: the level pours to its target, chime and pulse; sparks unless skipped. */
  const startPour = (sparks: boolean): void => {
    if (pourStarted.current) return;
    pourStarted.current = true;
    window.clearTimeout(pourTimer.current);
    setPoured(true);
    setGold(target);
    play("credit");
    haptic("credit");
    const r = goldLine.current?.getBoundingClientRect();
    const p = CELEBRATION.particles;
    if (sparks && r)
      burst(r.left + r.width / 2, r.top + r.height / 2, {
        type: "spark",
        count: p.count,
        speed: p.speed,
        angle: -Math.PI / 2,
        spread: p.spread,
        life: p.life,
        gravity: -30,
        jx: r.width / 3,
      });
    // No pour to watch (the gold paid off an owed balance, or nothing moved): a reward still arrives.
    if (target <= Math.min(ingot.size, ingot.from)) unlock();
  };

  // The pour starts once the sheet has risen; the live region speaks once, after it is in the page.
  useEffect(() => {
    pourTimer.current = window.setTimeout(
      () => {
        startPour(true);
      },
      reducedMotionNow() ? 0 : CELEBRATION.pourDelayMs,
    );
    const speak = window.setTimeout(() => {
      setSaid(announcement(moment));
    }, 150);
    return () => {
      window.clearTimeout(pourTimer.current);
      window.clearTimeout(speak);
    };
    // Once per moment: the host mounts a new one for each approval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tap anywhere but a button lands everything now (the pour, the reward card, the receipt's print). A click,
  // not pointerdown: starting a scroll (the moment scrolls at 320) must not skip what is about to be seen.
  const skip = (e: React.MouseEvent): void => {
    if ((e.target as Element).closest("button, a")) return;
    startPour(false);
    setSkipKey((k) => k + 1);
    requestAnimationFrame(() => {
      finishAll(body.current);
    });
  };

  const close = (): void => {
    if (!open) return;
    setOpen(false);
    window.setTimeout(onDone, EXIT_MS);
  };

  const share = async (): Promise<boolean> => {
    const url = `${window.location.origin}/s/${encodeURIComponent(shop.code)}`;
    const text = shareText(moment);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Moz Rewards", text, url });
        return true;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared("Link copied.");
      return true;
    } catch (err) {
      // The person closed the share sheet: not an error, nothing to say.
      if (err instanceof DOMException && err.name === "AbortError") return false;
      setShared("Couldn't share just now.");
      return false;
    }
  };

  return (
    <Overlay
      open={open}
      onClose={close}
      fallbackFocus={pageHeading}
      title="Gold added"
      description={purchaseLine(shop.name, moment.amountPence)}
      className="m-celebrate"
      footer={
        <div className="m-cel-actions">
          {moment.receipt && !receipt ? (
            <Button
              variant="ghost"
              size={46}
              onClick={() => {
                setReceipt(true);
              }}
              data-testid="celebration-receipt"
            >
              View receipt
            </Button>
          ) : null}
          <Button
            variant="orbit"
            size={46}
            icon={<Icon icon={Share2} size={18} />}
            onClick={share}
            data-testid="celebration-share"
          >
            Share
          </Button>
          <Button size={46} onClick={close} data-testid="celebration-done">
            Done
          </Button>
        </div>
      }
    >
      <div
        ref={body}
        className="m-cel"
        data-testid="celebration"
        data-request={moment.requestId}
        data-state={unlocked ? "unlocked" : poured ? "poured" : "rising"}
        style={
          {
            "--cel-count": `${String(CELEBRATION.countMs)}ms`,
            "--cel-shine": `${String(CELEBRATION.shimmerMs)}ms`,
          } as React.CSSProperties
        }
        onClick={skip}
      >
        <div className="m-cel-head">
          {/* The count starts with the pour (both from the level before), and lands with it. */}
          <p ref={goldLine} className="m-cel-gold" data-testid="celebration-gold">
            {skipKey > 0 || !poured ? (
              <span>{poured ? goldText(moment.gold) : "+0 gold"}</span>
            ) : (
              <>
                +<CountUp value={moment.gold} ms={CELEBRATION.countMs} /> gold
              </>
            )}
          </p>
          <p className="m-cel-line" data-testid="celebration-progress">
            {progressLine(ingot, moment.perVisit)}
          </p>
        </div>
        <GoldVault
          shop={{ name: shop.name, logoUrl: shop.logoUrl }}
          title={moment.title}
          gold={gold}
          size={ingot.size}
          ingots={ingot.ingotsBefore}
          {...(moment.perVisit === null ? {} : { perVisit: moment.perVisit })}
          seenKey={`celebration:${moment.requestId}`}
          still
          skipKey={skipKey}
          quiet={skipKey > 0}
          unlocked={unlocked}
          onFull={unlock}
          onLanded={(g) => {
            if (g >= target) unlock();
          }}
          rewardPlaceholder={
            reward ? (
              <RewardUnlocked
                celebrate={false}
                detail={rewardDetail}
                imageUrl={shop.logoUrl}
                shopName={shop.name}
                testId="reward-card-placeholder"
              >
                {/* The Redeem slot's idle height (a 46 px button in `.m-code`). */}
                <div className="m-code">
                  <span className="block h-[46px]" />
                </div>
              </RewardUnlocked>
            ) : null
          }
          reward={
            reward ? (
              <RewardUnlocked
                // Skipped before it arrived: the card simply shows, without the flip and the leaves.
                celebrate={skipKey === 0}
                detail={rewardDetail}
                imageUrl={shop.logoUrl}
                shopName={shop.name}
              >
                {/* C-108: Redeem right here opens the same redeem flow as the Wallet and the Vault. */}
                <RedeemFlow
                  rewardId={reward.id}
                  {...(moment.rewards.length > 1 ? { rewardLabel: reward.label } : {})}
                />
              </RewardUnlocked>
            ) : null
          }
        />
        {receipt && moment.receipt ? (
          <div ref={printed} tabIndex={-1} aria-label="Receipt" className="outline-none">
            <ReceiptCard receipt={moment.receipt} print />
          </div>
        ) : null}
        {shared ? (
          <p className="m-cel-note" role="status">
            {shared}
          </p>
        ) : null}
        <p className="sr-only" aria-live="polite" data-testid="celebration-live">
          {said}
        </p>
      </div>
    </Overlay>
  );
}
