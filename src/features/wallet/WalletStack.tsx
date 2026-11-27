"use client";

import { useRef, useState } from "react";
import { usePauseOffscreen } from "@/components/motion/usePauseOffscreen";
import { buttonClasses } from "@/components/ui/button-classes";
import { STACK_SIZE, stackGroups } from "./view";

/**
 * The Wallet's cards (PD-08, DESIGN §6.4). Phones: stacked like cards in a wallet, in groups of three; the
 * first group shows and "Show all" opens the rest (each its own stack). From 768px every card sits in the grid
 * (the stacks become its items: `.m-stack` is `display: contents` there), so the button isn't needed. One DOM
 * for both: the server renders it and CSS picks the layout. The cards' shine sleeps off screen.
 */
export function WalletStack({
  cards,
}: {
  /** The cards in Wallet order, rendered by the page (each a `.m-wcard`); `--i` (its place in its stack, the
   *  shine's stagger and the fan-out offset) is set on its slot. */
  cards: readonly { key: string; card: React.ReactNode }[];
}): React.JSX.Element {
  const [all, setAll] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  usePauseOffscreen(root);
  const groups = stackGroups(cards);
  const more = cards.length - STACK_SIZE;
  return (
    <div className="flex flex-col gap-4">
      <div
        ref={root}
        id="wallet-stacks"
        className="flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-4 xl:grid-cols-3"
        data-testid="wallet-cards"
      >
        {groups.map((group, g) => (
          <ul
            key={group[0]?.key}
            className="m-stack"
            data-stack={g}
            // Folded stacks hide below 768px in molten.css: a Tailwind `max-md:hidden` would lose to `.m-stack`'s
            // own (unlayered) `display`.
            data-folded={g > 0 && !all ? "" : undefined}
          >
            {group.map((card, i) => (
              <li
                key={card.key}
                className="m-wslot min-w-0"
                style={{ "--i": i } as React.CSSProperties}
              >
                {card.card}
              </li>
            ))}
          </ul>
        ))}
      </div>
      {more > 0 ? (
        // The breakpoint sits on a wrapper: `.m-btn` sets its own display, which a `md:hidden` on it can't beat.
        <div className="self-center md:hidden">
          <button
            type="button"
            className={buttonClasses({ variant: "ghost", size: 46 })}
            aria-expanded={all}
            aria-controls="wallet-stacks"
            data-testid="wallet-show-all"
            onClick={() => {
              setAll((v) => !v);
            }}
          >
            {all ? "Show fewer" : `Show all ${String(cards.length)} shops`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
