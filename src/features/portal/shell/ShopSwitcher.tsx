"use client";

import { Check, ChevronsUpDown, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Popover, usePopoverClose } from "@/components/motion";
import { Icon, toast } from "@/components/ui";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { switchShop } from "../actions";
import type { ShellShop } from "./types";

/**
 * Pick the shop the dashboard shows (P0-12, staff of several shops). The server action checks the
 * membership and sets the cookie; an action that sets a cookie makes Next re-render the whole tree (layouts
 * included) in its answer, then the client goes to `/dashboard`. No full page load: it would cut that answer
 * off mid-stream.
 */
function useSwitch(onSwitched?: () => void): {
  busy: string | null;
  choose: (shopId: string) => void;
} {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return {
    busy,
    choose: (shopId) => {
      setBusy(shopId);
      switchShop({ shopId })
        .then((r) => {
          if (r.ok) {
            router.push(r.data.to);
            setBusy(null);
            onSwitched?.();
            return;
          }
          setBusy(null);
          toast(r.error.message, "error");
        })
        .catch(() => {
          // Offline, or the request never reached the server: say so and let them try again.
          setBusy(null);
          toast("We couldn't switch shop. Check your connection and try again.", "error");
        });
    },
  };
}

function ShopLine({ shop }: { shop: ShellShop }): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col text-left">
      <span className="text-small truncate font-semibold">{shop.name}</span>
      {shop.town ? <span className="text-caption text-ink-2 truncate">{shop.town}</span> : null}
    </span>
  );
}

/** The plain list (inside the "More" sheet, where a popover can't open: C-39). */
export function ShopSwitchList({
  shops,
  activeShopId,
  onSwitched,
}: {
  shops: readonly ShellShop[];
  activeShopId: string | null;
  /** Called once the switch succeeded (closes the popover or sheet around the list). */
  onSwitched?: () => void;
}): React.JSX.Element {
  const hydrated = useHydrated();
  // Inside the sidebar's popover: close it after a switch.
  const closePopover = usePopoverClose();
  const { busy, choose } = useSwitch(onSwitched ?? closePopover ?? undefined);
  return (
    <ul aria-label="Your shops" className="flex flex-col gap-1">
      {shops.map((s) => {
        const current = s.id === activeShopId;
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={!hydrated}
              // Busy: aria-disabled, not disabled, so keyboard focus stays in the list (Esc still closes it).
              aria-disabled={busy !== null || undefined}
              aria-busy={busy === s.id || undefined}
              aria-current={current ? "true" : undefined}
              onClick={() => {
                if (!current && busy === null) choose(s.id);
              }}
              className={cx(
                "pressable flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2",
                current ? "bg-gold-100" : "hover:bg-surface-2",
              )}
            >
              <Icon icon={Store} />
              <ShopLine shop={s} />
              {current ? <Icon icon={Check} label="Current shop" /> : null}
              {busy === s.id ? (
                <span role="status" className="spinner">
                  <span className="sr-only">Switching</span>
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The sidebar's shop card: the active shop; with more than one shop, a popover to switch. */
export function ShopSwitcher({
  shops,
  activeShopId,
}: {
  shops: readonly ShellShop[];
  activeShopId: string | null;
}): React.JSX.Element | null {
  const active = shops.find((s) => s.id === activeShopId) ?? null;
  if (!active) return null;
  const card = (
    <>
      <span className="bg-gold-100 text-gold-700 grid size-10 shrink-0 place-items-center rounded-md">
        <Icon icon={Store} />
      </span>
      <ShopLine shop={active} />
    </>
  );
  if (shops.length < 2) {
    return (
      <div data-shop-switcher className="border-line flex items-center gap-3 rounded-md border p-2">
        {card}
      </div>
    );
  }
  return (
    <div data-shop-switcher>
      <Popover
        title="Switch shop"
        triggerClassName="border-line hover:bg-surface-2 flex w-full items-center gap-3 rounded-md border p-2"
        label={
          <>
            {card}
            <Icon icon={ChevronsUpDown} size={18} />
            <span className="sr-only">Switch shop</span>
          </>
        }
      >
        <div className="w-64 p-2">
          <ShopSwitchList shops={shops} activeShopId={activeShopId} />
        </div>
      </Popover>
    </div>
  );
}
