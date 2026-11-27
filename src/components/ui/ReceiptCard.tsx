"use client";

import { useLayoutEffect, useRef } from "react";
import {
  type CelebrationReceipt,
  printKeyframes,
  RECEIPT_PRINT,
  stampKeyframes,
} from "@/lib/celebration";
import { cx } from "@/lib/cx";
import { formatDateTime } from "@/lib/format-date";
import { longestWord } from "@/lib/longest-word";
import { formatPence } from "@/lib/money";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import "./receipt.css";

const gb = (n: number): string => n.toLocaleString("en-GB");
const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/**
 * A digital receipt (PRODUCT §11; DESIGN §8.5; P1-15): shop, date and time, items, amount, gold, staff initials,
 * number, and always "Digital receipt — not a VAT invoice" (the VAT number only when the shop gave one).
 * `print`: it prints upward as it arrives (800 ms, clip reveal from the top) and the gold stamp presses in;
 * `print="dashboard"`: 400 ms and the stamp simply shows. Reduced motion: a ≤ 150 ms fade, the stamp still. The text is
 * all there from the first frame, so a screen reader never waits for the animation.
 */
export function ReceiptCard({
  receipt,
  print = false,
  delayMs = 0,
  className,
}: {
  receipt: CelebrationReceipt;
  print?: boolean | "dashboard";
  /** Starts the print later (a sheet's own rise first, so the print isn't hidden behind it). */
  delayMs?: number;
  className?: string;
}): React.JSX.Element {
  const card = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  const gold = receipt.goldEarned + receipt.bonusGold;

  useLayoutEffect(() => {
    if (!print) return;
    const dashboard = print === "dashboard";
    // Reduced motion: a short fade, no rise, wipe or press (DESIGN §7.2), as RewardUnlocked does.
    const reduced = reducedMotionNow();
    // `backwards`: once printed, nothing holds the clip (it would cut the card's shadow off).
    const running = [
      anim(card.current, reduced ? FADE : printKeyframes(), {
        duration: dashboard ? RECEIPT_PRINT.dashboardMs : RECEIPT_PRINT.ms,
        delay: delayMs,
        fill: "backwards",
      }),
    ];
    if (!dashboard && !reduced)
      running.push(
        anim(stamp.current, stampKeyframes(), {
          duration: RECEIPT_PRINT.stamp.ms,
          delay: delayMs + RECEIPT_PRINT.stamp.delayMs,
          fill: "backwards",
        }),
      );
    // A tap lands it at once (skippable, DESIGN §8); a click, so starting a scroll doesn't skip it.
    const el = card.current;
    const skip = (): void => {
      for (const a of running) a?.finish();
    };
    el?.addEventListener("click", skip);
    return () => {
      el?.removeEventListener("click", skip);
      for (const a of running) a?.cancel();
    };
    // Once per arrival: the parent mounts a new card for each receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={card}
      className={cx("m-receipt", className)}
      data-testid="receipt-card"
      data-print={print ? (print === "dashboard" ? "dashboard" : "") : undefined}
    >
      <p className="m-receipt-kind">Digital receipt — not a VAT invoice</p>
      <div className="m-receipt-title">
        <h3
          className="m-receipt-shop"
          // The longest word's letters: the title steps down only when that word wouldn't fit (receipt.css).
          style={{ "--lw": longestWord(receipt.shopName) } as React.CSSProperties}
        >
          {receipt.shopName}
        </h3>
      </div>
      {receipt.address ? <p className="m-receipt-meta">{receipt.address}</p> : null}
      {receipt.vatNumber ? <p className="m-receipt-meta">VAT {receipt.vatNumber}</p> : null}
      <dl className="m-receipt-rows">
        <div>
          <dt>Receipt</dt>
          <dd data-testid="receipt-number">{gb(receipt.number)}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{formatDateTime(new Date(receipt.approvedAt))}</dd>
        </div>
        {receipt.items.length > 0 ? (
          <div>
            <dt>Items</dt>
            <dd>{receipt.items.join(", ")}</dd>
          </div>
        ) : null}
        {receipt.amountPence !== null ? (
          <div>
            <dt>Amount</dt>
            <dd>{formatPence(receipt.amountPence)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Gold</dt>
          <dd>
            {gb(receipt.goldEarned)}
            {receipt.bonusGold > 0 ? ` + ${gb(receipt.bonusGold)} streak bonus` : ""}
          </dd>
        </div>
        <div>
          <dt>Staff</dt>
          <dd>{receipt.staffInitials}</dd>
        </div>
      </dl>
      <span ref={stamp} className="m-receipt-stamp" aria-hidden="true">
        +{gb(gold)} gold
      </span>
    </div>
  );
}
