"use client";

import { LogIn, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { TransitionLink } from "@/components/motion";
import { Icon } from "@/components/ui";
import { cx } from "@/lib/cx";
import { navIcon } from "../nav-icons";
import { activeRoute, type PortalRoute } from "../routes";
import { NAV_LABEL } from "./labels";
import { PortalSwitcher } from "./PortalSwitcher";
import { Wordmark } from "./Wordmark";
import type { ShellProps } from "./types";

const itemClass = (active: boolean): string =>
  cx(
    "rail-item pressable text-small flex min-h-11 items-center gap-4 rounded-md px-[18px] font-semibold",
    active ? "bg-gold-100 text-ink" : "text-ink-2 hover:bg-surface-2",
  );

/**
 * Customer desktop and tablet rail (DESIGN §5): 72px of icons; from 1024px it opens to 220px with labels on
 * hover, and at any width while a keyboard focus is inside it. The panel is always 220px wide and clipped to
 * 72px, so opening animates `clip-path` and a transform (no layout), and it overlays the page instead of
 * pushing it. Logo, Wallet, Offers, Market, Notifications, Me; Install at the bottom (P5-03 fills the slot).
 * Touch screens and tablets can't hover: the "Show labels" toggle opens it (Esc or choosing a page closes it).
 * Below 768px the bottom nav takes over.
 */
export function CustomerRail({
  items,
  chrome,
}: {
  items: readonly PortalRoute[];
  chrome: ShellProps;
}): React.JSX.Element {
  const active = activeRoute(usePathname())?.path ?? null;
  const [open, setOpen] = useState(false);
  const id = useId();
  // Esc closes the labels wherever focus is (Safari doesn't focus a pressed button).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="hidden w-(--rail-w) shrink-0 md:block">
      <nav
        id={id}
        aria-label={NAV_LABEL.customer}
        data-portal-nav="side"
        data-open={open || undefined}
        className="rail"
        onClick={(e) => {
          if (e.target instanceof Element && e.target.closest("a")) setOpen(false);
        }}
      >
        <span aria-hidden className="rail-edge" />
        <TransitionLink
          href="/wallet"
          className="inline-flex min-h-11 items-center rounded-md px-4"
        >
          <Wordmark labelClassName="rail-label" />
        </TransitionLink>
        <ul className="flex flex-1 flex-col gap-1 px-2">
          {items
            .filter((r) => r.nav !== "mobile-only")
            .map((r) => (
              <li key={r.path}>
                <TransitionLink
                  href={r.path}
                  aria-current={r.path === active ? "page" : undefined}
                  className={itemClass(r.path === active)}
                >
                  <Icon icon={navIcon(r.icon)} />
                  <span className="rail-label">{r.label}</span>
                </TransitionLink>
              </li>
            ))}
        </ul>
        <div className="flex flex-col gap-1 px-2">
          <div data-slot="install-chip" />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => {
              setOpen((v) => !v);
            }}
            className={itemClass(false)}
          >
            <Icon icon={open ? PanelLeftClose : PanelLeftOpen} />
            <span className="rail-label">{open ? "Hide labels" : "Show labels"}</span>
          </button>
          {chrome.signedIn ? (
            <PortalSwitcher portals={chrome.portals} current="customer" compact className="px-2" />
          ) : (
            <a href="/sign-in" className={itemClass(false)}>
              <Icon icon={LogIn} />
              <span className="rail-label">Sign in</span>
            </a>
          )}
        </div>
      </nav>
    </div>
  );
}
