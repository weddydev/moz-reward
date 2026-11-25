"use client";

import { useRef } from "react";
import { TransitionLink } from "@/components/motion/TransitionLink";
import { usePauseOffscreen } from "@/components/motion/usePauseOffscreen";
import { totalText } from "./view";

/**
 * The Wallet's header, as the reference's (`.w-head`, `.bell`, `.total`): the time of day small above the first
 * name in Fraunces, the 44 px placed bell (the mobile top bar leaves its own bell out on the Wallet; from 768px
 * the rail carries notifications, so the bell hides), and the obsidian panel with the gold across every shop
 * under a turning light. The panel's light, its number's shine and the badge's ping sleep off screen.
 */
export function WalletHeader({
  part,
  name,
  gold,
  shops,
  unread = 0,
  children,
}: {
  part: string;
  name: string | null;
  gold: number;
  shops: number;
  /** Unread notifications for the badge (P3-07 supplies the count; C-87). */
  unread?: number;
  /** The summary row: under the total on phones, beside it from 1280px. */
  children?: React.ReactNode;
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  usePauseOffscreen(root);
  return (
    <div ref={root} className="flex min-w-0 flex-col gap-4" data-testid="wallet-header">
      <div className="m-w-head gap-3">
        <div className="min-w-0" data-testid="wallet-greeting">
          {name ? <p className="m-hi">{part}</p> : null}
          <p className="m-wname break-words">{name ?? part}</p>
        </div>
        {/* A wrapper carries `md:hidden`: `.m-bell`'s own (unlayered) `display` would beat the utility. */}
        <span className="shrink-0 md:hidden">
          <WalletBell unread={unread} />
        </span>
      </div>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
        {shops > 0 ? (
          <p className="m-total xl:min-w-0 xl:flex-1" data-testid="wallet-total">
            <span className="m-t-num">{gold.toLocaleString("en-GB")}</span>
            <span className="m-t-lbl">{totalText(shops)}</span>
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** The reference's bell: rings on hover and keyboard focus; an ember badge with a ping when there is news. */
function WalletBell({ unread }: { unread: number }): React.JSX.Element {
  const label =
    unread > 0 ? `Notifications, ${unread.toLocaleString("en-GB")} new` : "Notifications";
  return (
    <TransitionLink
      href="/notifications"
      aria-label={label}
      className="m-bell pressable"
      data-testid="wallet-bell"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 ? <i aria-hidden="true">{unread > 99 ? "99+" : unread}</i> : null}
    </TransitionLink>
  );
}
