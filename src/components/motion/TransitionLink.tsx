"use client";

import Link from "next/link";
import { type Hero, setHero } from "@/lib/motion/hero-handoff";
import { setNavIntent } from "@/lib/motion/nav-intent";
import { NAV, type NavType, tabTransitionTypes } from "@/lib/motion/route-transitions";

type LinkProps = React.ComponentProps<typeof Link>;

/**
 * A `next/link` that tells the arriving page which way to slide in: `forward` (deeper: from the right),
 * `back` (up/out: from the left), or a tab move (`tab: { from, to }` positions in the nav order). Without a
 * direction it is a plain Link (the page only fades in). Only a plain left click records it: a modified
 * click opens a new tab and must not tag a later navigation. `hero` hands the card's identity (id, name, image:
 * what the card already shows) to the destination's loading state, so a card → page morph still forms when the
 * page commits its loading fallback first (`hero-handoff`).
 */
export function TransitionLink({
  direction,
  tab,
  hero,
  onClick,
  ...props
}: LinkProps & {
  direction?: "forward" | "back";
  tab?: { from: number; to: number };
  hero?: Hero;
}): React.JSX.Element {
  const type: NavType | undefined = tab
    ? tabTransitionTypes(tab.from, tab.to)[0]
    : direction
      ? direction === "forward"
        ? NAV.forward
        : NAV.back
      : undefined;
  return (
    <Link
      {...props}
      onClick={(e) => {
        onClick?.(e);
        const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
        if (!plain || e.defaultPrevented) return;
        if (type) setNavIntent(e.currentTarget.href, type);
        if (hero) setHero(e.currentTarget.href, hero);
      }}
    />
  );
}
