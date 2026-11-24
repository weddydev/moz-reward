"use client";

import { Ellipsis } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { TransitionLink } from "@/components/motion";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Dock, DOCK_ITEM, DOCK_SCAN, scanPress } from "@/components/ui/Dock";
import { DOCK_ICONS } from "@/components/ui/dock-icons";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { navIcon } from "../nav-icons";
import { activeRoute, type PortalRoute } from "../routes";
import { dockPlacement, plainClick, type PendingTap } from "./dock-placement";
import { NAV_LABEL } from "./labels";
import { PortalSwitchList } from "./PortalSwitcher";
import { ShopSwitchList } from "./ShopSwitcher";
import type { ShellProps } from "./types";

/** A dock icon: the reference's own drawing where it has one (customer items), else the Lucide icon. */
function DockGlyph({ name }: { name: string }): React.JSX.Element {
  const Molten = DOCK_ICONS[name];
  return Molten ? <Molten /> : <Icon icon={navIcon(name)} />;
}

/**
 * The mobile bottom nav (DESIGN §5, PD-07): the floating dock. Customer Wallet, Offers, raised Scan, Market, Me
 * (below 768px); shop Home, Requests, Scan, Customers, More and admin Overview, Applications, Shops, Moderation,
 * More (below 1024px). The current page sits on the dock's liquid gold, which pours to the next one as the
 * route changes; Scan is the raised coin (its name is read out, not shown). `position: fixed` and safe-area
 * aware, so the shell keeps it outside `RouteTransition`. "More" opens a sheet with the rest of the role's
 * pages, the shop switcher and the role switcher.
 *
 * Labels never truncate: at 320px a column is 56px and "Customers" needs about that much, so a label may spill a
 * few pixels into its neighbour's space, centred (its neighbour is the label-less Scan coin or "More"); the dock
 * never scrolls sideways (E2E at 320px).
 */
export function BottomNav({
  items,
  chrome,
}: {
  items: readonly PortalRoute[];
  chrome: ShellProps;
}): React.JSX.Element {
  const hydrated = useHydrated();
  const pathname = usePathname();
  // Open for the page it was opened on: a navigation underneath (Back, a link) closes it.
  const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
  const moreOpen = moreOpenOn === pathname;
  const setMoreOpen = (open: boolean): void => {
    setMoreOpenOn(open ? pathname : null);
  };
  const active = activeRoute(pathname)?.path ?? null;
  const bar = items.filter((r) => r.mobile);
  const rest = items.filter((r) => !r.mobile);
  const hasMore = chrome.portal !== "customer";
  const moreActive = rest.some((r) => r.path === active);
  // A tap pours the gold at once; the committed route takes over when the URL changes (dockPlacement).
  const [pending, setPending] = useState<PendingTap | null>(null);
  const { current, columns, column, liquid } = dockPlacement({
    bar,
    rest,
    activePath: active,
    hasMore,
    pathname,
    pending,
  });
  const tapped = (e: React.MouseEvent, col: number): void => {
    if (plainClick(e)) setPending({ from: pathname, column: col });
  };
  return (
    <>
      <Dock
        label={NAV_LABEL[chrome.portal]}
        active={liquid}
        column={column}
        columns={columns}
        hideFrom={chrome.portal === "customer" ? "md" : "lg"}
        data-portal-nav="bottom"
        data-until={chrome.portal === "customer" ? "md" : "lg"}
      >
        {bar.map((r, i) => {
          const isActive = r.path === active;
          const label = r.mobileLabel ?? r.label;
          const tab = current >= 0 ? { tab: { from: current, to: i } } : {};
          return r.raised ? (
            <TransitionLink
              key={r.path}
              href={r.path}
              {...tab}
              aria-current={isActive ? "page" : undefined}
              data-raised
              className={DOCK_SCAN}
              onClick={(e) => {
                scanPress(e.currentTarget);
                tapped(e, -1);
              }}
            >
              <DockGlyph name={r.icon} />
              <span className="sr-only">{label}</span>
            </TransitionLink>
          ) : (
            <TransitionLink
              key={r.path}
              href={r.path}
              {...tab}
              aria-current={isActive ? "page" : undefined}
              data-liq
              className={DOCK_ITEM}
              onClick={(e) => {
                tapped(e, i);
              }}
            >
              <DockGlyph name={r.icon} />
              <span data-nav-label>{label}</span>
            </TransitionLink>
          );
        })}
        {hasMore ? (
          <button
            type="button"
            disabled={!hydrated}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            data-liq
            // The gold marks "one of More's pages is open" (the item is a button, so not aria-current).
            data-current={moreActive ? "" : undefined}
            onClick={() => {
              setMoreOpen(true);
            }}
            className={DOCK_ITEM}
          >
            <Icon icon={Ellipsis} />
            <span data-nav-label>More</span>
          </button>
        ) : null}
      </Dock>
      {hasMore ? (
        <BottomSheet
          open={moreOpen}
          onClose={() => {
            setMoreOpen(false);
          }}
          title="More"
        >
          <div className="flex flex-col gap-6 pb-2">
            <ul className="flex flex-col gap-1">
              {rest.map((r) => (
                <li key={r.path}>
                  <TransitionLink
                    href={r.path}
                    aria-current={r.path === active ? "page" : undefined}
                    onClick={() => {
                      setMoreOpen(false);
                    }}
                    className={cx(
                      "pressable text-small flex min-h-11 items-center gap-3 rounded-md px-3 font-semibold",
                      r.path === active ? "bg-champagne text-ink" : "text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    <Icon icon={navIcon(r.icon)} />
                    {r.label}
                  </TransitionLink>
                </li>
              ))}
            </ul>
            {chrome.portal === "shop" && chrome.shops.length > 1 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-caption text-ink-2 px-3 font-semibold">Your shops</h3>
                <ShopSwitchList
                  shops={chrome.shops}
                  activeShopId={chrome.activeShopId}
                  onSwitched={() => {
                    setMoreOpen(false);
                  }}
                  inlineErrors
                />
              </section>
            ) : null}
            {chrome.portals.length > 1 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-caption text-ink-2 px-3 font-semibold">Switch to</h3>
                <PortalSwitchList portals={chrome.portals} current={chrome.portal} />
              </section>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}
