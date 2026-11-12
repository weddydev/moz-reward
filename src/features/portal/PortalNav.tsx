"use client";

import { usePathname } from "next/navigation";
import { TransitionLink } from "@/components/motion";
import { Icon } from "@/components/ui";
import { cx } from "@/lib/cx";
import { navIcon } from "./nav-icons";
import { activeRoute, type Portal, type PortalRoute } from "./routes";

const NAV_LABEL: Record<Portal, string> = {
  customer: "Main",
  shop: "Shop dashboard",
  admin: "Admin",
};

/**
 * A portal's navigation, built from the route table rows the layout passes in (already filtered to what
 * the role may open; the page gate is the control). From 1024px a side column; below it a bottom bar,
 * `position: fixed` and safe-area aware, which is why the shell keeps this outside `RouteTransition`.
 * A client component: layouts don't re-render on navigation, so the active item comes from `usePathname`.
 *
 * Step C structure only: the rail/sidebar widths, raised Scan button, "More" sheet and role switcher of
 * DESIGN §5 land with step E.
 */
export function PortalNav({
  portal,
  items,
}: {
  portal: Portal;
  items: readonly PortalRoute[];
}): React.JSX.Element {
  const active = activeRoute(usePathname())?.path ?? null;
  const side = items.filter((r) => r.nav !== "mobile-only");
  const bottom = items.filter((r) => r.mobile);
  const current = bottom.findIndex((r) => r.path === active);
  return (
    <>
      <nav
        aria-label={NAV_LABEL[portal]}
        data-portal-nav="side"
        className="border-line bg-surface hidden w-62 shrink-0 flex-col gap-1 border-r p-3 lg:flex"
      >
        {side.map((r) => (
          <TransitionLink
            key={r.path}
            href={r.path}
            aria-current={r.path === active ? "page" : undefined}
            className={cx(
              "text-small flex h-11 items-center gap-3 rounded-md px-3 font-semibold",
              r.path === active ? "bg-gold-100 text-ink" : "text-ink-2",
            )}
          >
            <Icon icon={navIcon(r.icon)} />
            {r.label}
          </TransitionLink>
        ))}
      </nav>
      <nav
        aria-label={NAV_LABEL[portal]}
        data-portal-nav="bottom"
        className="border-line bg-surface pb-safe pl-safe pr-safe fixed inset-x-0 bottom-0 z-30 border-t lg:hidden"
      >
        <ul className="mx-auto flex h-16 max-w-xl items-stretch">
          {bottom.map((r, i) => (
            <li key={r.path} className="flex min-w-0 flex-1">
              <TransitionLink
                href={r.path}
                {...(current >= 0 ? { tab: { from: current, to: i } } : {})}
                aria-current={r.path === active ? "page" : undefined}
                className={cx(
                  "text-caption flex min-w-0 flex-1 flex-col items-center justify-center gap-1 font-semibold",
                  r.path === active ? "text-ink" : "text-ink-2",
                )}
              >
                <Icon icon={navIcon(r.icon)} />
                <span className="max-w-full truncate">{r.mobileLabel ?? r.label}</span>
              </TransitionLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
