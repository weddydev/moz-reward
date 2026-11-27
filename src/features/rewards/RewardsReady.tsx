"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import type { ReadyRewardView } from "./view";

/** Set once the sheet's chunk has arrived: Redeem then opens it at once, with no busy state. */
let sheetLoaded = false;
const loadSheet = () =>
  import("./RedeemSheet").then((m) => {
    sheetLoaded = true;
    return m;
  });
const RedeemSheet = lazy(loadSheet);

/** A load quicker than this shows no busy state (no spinner flashing for a frame; P1 close design review L2). */
const BUSY_AFTER_MS = 150;
const fetchSheet = (): void => {
  loadSheet().catch(() => {
    /* asked for again on press; a failure then says so (no unhandled ChunkLoadError per press) */
  });
};

/** At an idle moment once there is something to redeem (1 s later where there is no idle callback: WebKit). */
function preloadSheet(): () => void {
  const load = fetchSheet;
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(load);
    return () => {
      window.cancelIdleCallback(id);
    };
  }
  const id = window.setTimeout(load, 1_000);
  return () => {
    window.clearTimeout(id);
  };
}

/**
 * "Rewards ready" with Redeem (P1-16): the Wallet's right column (every shop, C-65) and the Gold Vault's card (one
 * shop, C-67). Each Redeem opens the same redeem flow in a sheet. The sheet's chunk is fetched at idle once the
 * list shows (and on press or focus); a press before it has arrived shows that row busy until the sheet opens
 * (P1-D close QA MINOR 5: 4–5 s of nothing on slow 3G), and a chunk that fails to load says so.
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
  const [pending, setPending] = useState<string | null>(null);
  /** The latest press: a slower earlier load never opens a sheet the person has moved on from. */
  const latest = useRef<string | null>(null);
  const busyTimer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(busyTimer.current);
    },
    [],
  );
  const any = rewards.length > 0;

  useEffect(() => (any && !sheetLoaded ? preloadSheet() : undefined), [any]);

  const show = (r: ReadyRewardView): void => {
    latest.current = r.id;
    if (sheetLoaded) {
      setShown(r);
      setOpen(r);
      return;
    }
    window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => {
      if (latest.current === r.id) setPending(r.id);
    }, BUSY_AFTER_MS);
    loadSheet().then(
      () => {
        window.clearTimeout(busyTimer.current);
        if (latest.current !== r.id) return;
        setPending(null);
        setShown(r);
        setOpen(r);
      },
      () => {
        window.clearTimeout(busyTimer.current);
        if (latest.current !== r.id) return;
        setPending(null);
        toast("Couldn’t open the reward just now. Check your connection and try again.", "error");
      },
    );
  };

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
              onPointerDown={fetchSheet}
              onFocus={fetchSheet}
              onClick={() => {
                show(r);
              }}
              loading={pending === r.id}
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
