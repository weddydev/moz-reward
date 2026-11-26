"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import { ReceiptCard } from "@/components/ui/ReceiptCard";
import { preloadCelebration } from "@/features/celebrations/CelebrationHost";
import type { Celebration } from "@/lib/celebration";
import { Section } from "../Section";

const CelebrationMoment = lazy(() => import("@/features/celebrations/CelebrationMoment"));

const RECEIPT: NonNullable<Celebration["receipt"]> = {
  id: "00000000-0000-4000-8000-000000000101",
  number: 128,
  shopName: "Brew & Bloom Café",
  address: "12 Market Street, Leeds LS1 6DT",
  vatNumber: null,
  approvedAt: "2026-11-26T14:05:00.000Z",
  items: ["Flat white", "Almond croissant"],
  amountPence: 840,
  goldEarned: 80,
  bonusGold: 0,
  staffInitials: "SL",
};

const BASE: Celebration = {
  requestId: "00000000-0000-4000-8000-000000000100",
  shop: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Brew & Bloom Café",
    logoUrl: null,
    code: "BREW23",
  },
  gold: 80,
  amountPence: 840,
  ingot: { from: 640, to: 720, size: 1_000, ingotsBefore: 2, filled: 0 },
  title: "Free coffee & cake",
  perVisit: 80,
  rewards: [],
  receipt: RECEIPT,
};

/** Sample moments for /dev/motion (DESIGN §8: every signature moment has a dev preview). */
export const CELEBRATION_SAMPLES = {
  credit: BASE,
  reward: {
    ...BASE,
    requestId: "00000000-0000-4000-8000-000000000102",
    ingot: { from: 940, to: 20, size: 1_000, ingotsBefore: 2, filled: 1 },
    rewards: [
      { id: "00000000-0000-4000-8000-000000000201", label: "Free coffee & cake", kind: "main" },
    ],
  },
} satisfies Record<string, Celebration>;

/**
 * Points credited → reward unlocked (DESIGN §8.2, §8.4) and the receipt print (§8.5), P1-15. Opens the real
 * moment with sample data (no server claim); tap it to skip, Done or Esc to close.
 */
export function CelebrationDemo(): React.JSX.Element {
  const [open, setOpen] = useState<{ key: number; moment: Celebration } | null>(null);
  const [print, setPrint] = useState<{ key: number; kind: true | "dashboard" } | null>(null);
  // As in the app: the moment's chunk is ready before a moment opens.
  useEffect(() => {
    preloadCelebration();
  }, []);
  const start = (moment: Celebration): void => {
    setOpen((o) => ({ key: (o?.key ?? 0) + 1, moment }));
  };
  return (
    <Section title="Celebrations">
      <p className="text-small text-ink-2 max-w-prose">
        Points credited pours from the level before the visit to the new one; a filled ingot chains
        into the reward. Tap the moment to skip; reduced motion shows the end state.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClasses({ variant: "orbit", size: 46 })}
          onClick={() => {
            start(CELEBRATION_SAMPLES.credit);
          }}
          data-testid="demo-celebrate-credit"
        >
          Points credited
        </button>
        <button
          type="button"
          className={buttonClasses({ variant: "orbit", size: 46 })}
          onClick={() => {
            start(CELEBRATION_SAMPLES.reward);
          }}
          data-testid="demo-celebrate-reward"
        >
          Reward unlocked
        </button>
        <button
          type="button"
          className={buttonClasses({ variant: "ghost", size: 46 })}
          onClick={() => {
            setPrint((p) => ({ key: (p?.key ?? 0) + 1, kind: true }));
          }}
          data-testid="demo-receipt"
        >
          Print receipt
        </button>
        <button
          type="button"
          className={buttonClasses({ variant: "ghost", size: 46 })}
          onClick={() => {
            setPrint((p) => ({ key: (p?.key ?? 0) + 1, kind: "dashboard" }));
          }}
          data-testid="demo-receipt-dashboard"
        >
          Dashboard receipt
        </button>
      </div>
      {print ? (
        <div className="max-w-sm">
          <ReceiptCard key={print.key} receipt={RECEIPT} print={print.kind} />
        </div>
      ) : null}
      {open ? (
        <Suspense fallback={null}>
          <CelebrationMoment
            key={open.key}
            moment={open.moment}
            onDone={() => {
              setOpen(null);
            }}
          />
        </Suspense>
      ) : null}
    </Section>
  );
}
