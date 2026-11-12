"use client";

import { usePathname } from "next/navigation";
import { TransitionLink } from "@/components/motion";
import { Icon } from "@/components/ui";
import { cx } from "@/lib/cx";
import { navIcon } from "../nav-icons";
import { activeRoute, type PortalRoute } from "../routes";
import { NAV_LABEL, ROLE_LABEL } from "./labels";
import { PlanStatus } from "./PlanStatus";
import { PortalSwitcher } from "./PortalSwitcher";
import { ShopSwitcher } from "./ShopSwitcher";
import { Wordmark } from "./Wordmark";
import type { ShellProps } from "./types";

/**
 * Shop and admin desktop sidebar (DESIGN §5: 248px, section icons). Shop: shop card (switcher when the user
 * has several shops) above the nav, plan state in the footer. Admin: the role under the name. Both: the role
 * switcher at the bottom. From 1024px; below it the bottom nav takes over.
 */
export function SideNav({
  items,
  chrome,
}: {
  items: readonly PortalRoute[];
  chrome: ShellProps;
}): React.JSX.Element {
  const active = activeRoute(usePathname())?.path ?? null;
  const shop = chrome.shops.find((s) => s.id === chrome.activeShopId) ?? null;
  return (
    <nav
      aria-label={NAV_LABEL[chrome.portal]}
      data-portal-nav="side"
      className="border-line bg-surface sticky top-0 hidden h-dvh w-(--sidebar-w) shrink-0 flex-col gap-4 self-start border-r py-4 lg:flex"
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
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
        {items
          .filter((r) => r.nav !== "mobile-only")
          .map((r) => (
            <li key={r.path}>
              <TransitionLink
                href={r.path}
                aria-current={r.path === active ? "page" : undefined}
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
      <div className="border-line flex flex-col gap-2 border-t px-3 pt-3">
        <PortalSwitcher portals={chrome.portals} current={chrome.portal} />
        {shop ? <PlanStatus status={shop.status} owner={chrome.role === "owner"} /> : null}
      </div>
    </nav>
  );
}
