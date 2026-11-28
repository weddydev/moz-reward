"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { TransitionLink } from "@/components/motion";
import { useLiquidPour } from "@/components/motion/useLiquidPour";
import { DOCK_ICONS } from "@/components/ui/dock-icons";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/lib/cx";
import { navIcon } from "../nav-icons";
import { activeRoute, type PortalRoute } from "../routes";
import { plainClick } from "./dock-placement";
import { NAV_LABEL, ROLE_LABEL } from "./labels";
import { NavCount } from "./NavCount";
import { PlanStatus } from "./PlanStatus";
import { PortalSwitcher } from "./PortalSwitcher";
import { ShopSwitcher } from "./ShopSwitcher";
import { Wordmark } from "./Wordmark";
import type { ShellProps } from "./types";

/**
 * Shop and admin desktop sidebar (DESIGN §5: 248px, section icons). Shop: shop card (switcher when the user
 * has several shops) above the nav, plan state in the footer. Admin: the role under the name. Both: the role
 * switcher at the bottom. From 1024px; below it the bottom nav takes over.
 *
 * Molten (PD-11, extended from the customer rail): the rail's glass, the current page on the dock's liquid gold
 * poured along the column as the route changes (`useLiquidPour`, axis "y"), the dock's icons where it draws
 * them, and the icon lifting on hover and when current.
 */
export function SideNav({
  items,
  chrome,
}: {
  items: readonly PortalRoute[];
  chrome: ShellProps;
}): React.JSX.Element {
  const pathname = usePathname();
  const active = activeRoute(pathname)?.path ?? null;
  const shop = chrome.shops.find((s) => s.id === chrome.activeShopId) ?? null;
  const shown = items.filter((r) => r.nav !== "mobile-only");
  // A tap pours the gold at once; the committed route takes over when the URL changes (as the rail).
  const [pending, setPending] = useState<{ from: string; index: number } | null>(null);
  const index =
    pending && pending.from === pathname
      ? pending.index
      : shown.findIndex((r) => r.path === active);
  // The CSS-only first-paint placement, frozen so later renders never overwrite the hook's (as the rail).
  const [ssrIndex] = useState(() => Math.max(0, index));
  const list = useRef<HTMLUListElement>(null);
  const blob = useRef<HTMLSpanElement>(null);
  const drops = useRef<Array<HTMLSpanElement | null>>([]);
  useLiquidPour({
    rootRef: list,
    blobRef: blob,
    dropsRef: drops,
    items: () => [...(list.current?.querySelectorAll<HTMLElement>(":scope > li > a") ?? [])],
    index,
    axis: "y",
  });
  return (
    <nav
      aria-label={NAV_LABEL[chrome.portal]}
      data-portal-nav="side"
      className="m-side border-line sticky top-0 hidden h-dvh w-(--sidebar-w) shrink-0 flex-col gap-4 self-start border-r py-4 lg:flex"
    >
      <div className="flex flex-col gap-3 px-4">
        <Wordmark />
        {chrome.portal === "shop" ? (
          <ShopSwitcher shops={chrome.shops} activeShopId={chrome.activeShopId} />
        ) : (
          <p className="text-caption text-ink-2 px-1">
            Admin{chrome.role ? ` · ${ROLE_LABEL[chrome.role] ?? ""}` : ""}
          </p>
        )}
      </div>
      <ul
        ref={list}
        data-empty={index < 0 ? "" : undefined}
        className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3"
      >
        <li className="m-goo" aria-hidden="true">
          <span
            ref={blob}
            className="m-blob"
            style={{ transform: `translateY(calc(${String(ssrIndex)} * (100% + 4px)))` }}
          />
          <span
            ref={(el) => {
              drops.current[0] = el;
            }}
            className="m-drop"
          />
        </li>
        {shown.map((r, i) => {
          const Molten = DOCK_ICONS[r.icon];
          const current = r.path === active;
          return (
            <li key={r.path}>
              <TransitionLink
                href={chrome.targets?.[r.path] ?? r.path}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "m-side-item text-small flex min-h-11 items-center gap-3 rounded-md px-3 font-semibold",
                  current ? "text-ink" : "text-ink-2",
                )}
                onClick={(e) => {
                  if (plainClick(e)) setPending({ from: pathname, index: i });
                }}
              >
                {Molten ? <Molten className="m-side-icon" /> : <Icon icon={navIcon(r.icon)} />}
                {r.label}
                <NavCount n={chrome.counts[r.path]} />
              </TransitionLink>
            </li>
          );
        })}
      </ul>
      <div className="border-line flex flex-col gap-2 border-t px-3 pt-3">
        <PortalSwitcher portals={chrome.portals} current={chrome.portal} />
        {shop ? <PlanStatus status={shop.status} owner={chrome.role === "owner"} /> : null}
      </div>
    </nav>
  );
}
