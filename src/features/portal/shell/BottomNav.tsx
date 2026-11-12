"use client";

import { Ellipsis } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { TransitionLink } from "@/components/motion";
import { BottomSheet, Icon } from "@/components/ui";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { navIcon } from "../nav-icons";
import { activeRoute, type PortalRoute } from "../routes";
import { NAV_LABEL } from "./labels";
import { PortalSwitchList } from "./PortalSwitcher";
import { ShopSwitchList } from "./ShopSwitcher";
import type { ShellProps } from "./types";

const slotClass =
  "text-caption flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 font-semibold";

/** Icon in a pill that turns gold-tinted when active (reference: mobile dashboards). */
function Pill({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={cx(
        "rounded-pill duration-fast grid h-8 w-14 place-items-center transition-colors",
        active && "bg-gold-100",
      )}
    >
      {children}
    </span>
  );
}

/**
 * The mobile bottom nav (DESIGN §5): customer Wallet, Offers, raised Scan, Market, Me (below 768px); shop
 * Home, Requests, Scan, Customers, More and admin Overview, Applications, Shops, Moderation, More (below
 * 1024px). `position: fixed` and safe-area aware, so the shell keeps it outside `RouteTransition`. "More"
 * opens a sheet with the rest of the role's pages, the shop switcher and the role switcher.
 */
export function BottomNav({
  items,
  chrome,
}: {
  items: readonly PortalRoute[];
  chrome: ShellProps;
}): React.JSX.Element {
  const hydrated = useHydrated();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeRoute(usePathname())?.path ?? null;
  const bar = items.filter((r) => r.mobile);
  const rest = items.filter((r) => !r.mobile);
  const hasMore = chrome.portal !== "customer";
  const current = bar.findIndex((r) => r.path === active);
  const moreActive = rest.some((r) => r.path === active);
  return (
    <>
      <nav
        aria-label={NAV_LABEL[chrome.portal]}
        data-portal-nav="bottom"
        data-until={chrome.portal === "customer" ? "md" : "lg"}
        className={cx(
          "border-line bg-surface pb-safe pl-safe pr-safe fixed inset-x-0 bottom-0 z-30 border-t",
          chrome.portal === "customer" ? "md:hidden" : "lg:hidden",
        )}
      >
        <ul className="mx-auto flex h-(--bottom-nav-h) max-w-xl items-stretch">
          {bar.map((r, i) => {
            const isActive = r.path === active;
            const label = r.mobileLabel ?? r.label;
            return (
              <li key={r.path} className="flex min-w-0 flex-1">
                <TransitionLink
                  href={r.path}
                  {...(current >= 0 ? { tab: { from: current, to: i } } : {})}
                  aria-current={isActive ? "page" : undefined}
                  className={cx(slotClass, "pressable", isActive ? "text-ink" : "text-ink-2")}
                >
                  {r.raised ? (
                    <span className="scan-raised" data-raised>
                      <Icon icon={navIcon(r.icon)} size={24} />
                    </span>
                  ) : (
                    <Pill active={isActive}>
                      <Icon icon={navIcon(r.icon)} />
                    </Pill>
                  )}
                  <span className="max-w-full truncate">{label}</span>
                </TransitionLink>
              </li>
            );
          })}
          {hasMore ? (
            <li className="flex min-w-0 flex-1">
              <button
                type="button"
                disabled={!hydrated}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                onClick={() => {
                  setMoreOpen(true);
                }}
                className={cx(slotClass, "pressable", moreActive ? "text-ink" : "text-ink-2")}
              >
                <Pill active={moreActive}>
                  <Icon icon={Ellipsis} />
                </Pill>
                <span>More</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
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
                      r.path === active ? "bg-gold-100 text-ink" : "text-ink-2 hover:bg-surface-2",
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
                <ShopSwitchList shops={chrome.shops} activeShopId={chrome.activeShopId} />
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
