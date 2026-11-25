"use client";

import { Bell, LogIn, ScanLine } from "lucide-react";
import { usePathname } from "next/navigation";
import { TransitionLink } from "@/components/motion";
import { buttonClasses } from "@/components/ui/button-classes";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/lib/cx";
import { PortalSwitcher } from "./PortalSwitcher";
import { Wordmark } from "./Wordmark";
import type { ShellProps } from "./types";

const iconLink =
  "pressable text-ink hover:bg-surface-2 inline-grid size-11 place-items-center rounded-md";

/**
 * The bar above the page content (DESIGN §5). Pages render their own title (h1); the header carries the
 * brand and actions. Customer, below 768px: notifications (or Sign in for visitors), the install chip slot
 * (P5-03) and the role switcher (on the Wallet the page's own header carries the bell, as the reference's
 * `.w-head`); from 768px the rail has all of it, so there is no header. Shop and admin,
 * below 1024px: the brand and the active shop; from 1024px the shop gets the primary action (Scan member QR:
 * desktop has no Scan nav item). Search arrives with the search features (DECISIONS 13 Nov 2026).
 */
export function PortalHeader({ chrome }: { chrome: ShellProps }): React.JSX.Element | null {
  const pathname = usePathname();
  if (chrome.portal === "customer") {
    return (
      <header className="pt-safe pl-safe pr-safe md:hidden">
        <div className="mx-auto flex h-14 max-w-(--content-max) items-center justify-between gap-2 px-4">
          <TransitionLink href="/wallet" className="inline-flex min-h-11 items-center rounded-md">
            <Wordmark />
          </TransitionLink>
          <div className="flex items-center gap-1">
            <div data-slot="install-chip" />
            {chrome.signedIn ? (
              <>
                {pathname === "/wallet" ? null : (
                  <TransitionLink
                    href="/notifications"
                    aria-label="Notifications"
                    className={iconLink}
                  >
                    <Icon icon={Bell} />
                  </TransitionLink>
                )}
                <PortalSwitcher portals={chrome.portals} current="customer" compact />
              </>
            ) : (
              <a href="/sign-in" className={buttonClasses({ variant: "orbit", size: 54 })}>
                <Icon icon={LogIn} size={18} />
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>
    );
  }
  const shop = chrome.shops.find((s) => s.id === chrome.activeShopId) ?? null;
  return (
    <header
      className={cx(
        "pt-safe pl-safe pr-safe",
        // Desktop: no row of its own, so page titles start at the same height in every portal; the shop's
        // primary action sits over the right of the title row (reference: dashboard).
        chrome.portal === "admin" ? "lg:hidden" : "lg:absolute lg:top-6 lg:right-8 lg:z-10",
      )}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 lg:min-h-0 lg:px-0">
        <div className="flex min-w-0 items-center gap-2 lg:hidden">
          {/* Below 360px the crown alone, so the shop's name has room. */}
          <Wordmark labelClassName="max-[359px]:sr-only" />
          {shop ? (
            <span className="text-small text-ink-2 truncate font-semibold" data-active-shop>
              {shop.name}
            </span>
          ) : chrome.portal === "admin" ? (
            <span className="text-small text-ink-2 font-semibold">Admin</span>
          ) : null}
        </div>
        {chrome.portal === "shop" ? (
          <div className="hidden lg:block">
            <TransitionLink href="/dashboard/scan" className={buttonClasses({ size: 54 })}>
              <Icon icon={ScanLine} />
              Scan member QR
            </TransitionLink>
          </div>
        ) : null}
      </div>
    </header>
  );
}
