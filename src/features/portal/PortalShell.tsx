import { RouteTransition } from "@/components/motion";
import { Toaster } from "@/components/ui";
import { cx } from "@/lib/cx";
import { ActiveShopSync } from "./shell/ActiveShopSync";
import { BottomNav } from "./shell/BottomNav";
import { CustomerRail } from "./shell/CustomerRail";
import { PortalHeader } from "./shell/PortalHeader";
import { SideNav } from "./shell/SideNav";
import type { PortalRoute } from "./routes";
import type { ShellProps } from "./shell/types";

/**
 * The frame every portal page sits in (P0-12, DESIGN §5): the side navigation (customer rail from 768px,
 * shop/admin sidebar from 1024px), the header, the page content, the bottom nav below those widths and the
 * toast region. Rendered by the group layout only **after** its gate allowed the request, so a portal-level
 * deny shows no shell.
 *
 * Only the page content is inside `RouteTransition`. The bottom nav, the rail and the Toaster are
 * `position: fixed` and stay outside it: sliding content has a transform, which would make it their
 * containing block. `<main id="main">` is here (the skip link's target), so portal pages render no `<main>`.
 */
export function PortalShell({
  nav,
  chrome,
  children,
}: {
  nav: readonly PortalRoute[];
  chrome: ShellProps;
  children: React.ReactNode;
}): React.JSX.Element {
  const customer = chrome.portal === "customer";
  return (
    <div
      data-portal={chrome.portal}
      className={cx("flex min-h-0 flex-1 flex-col", customer ? "md:flex-row" : "lg:flex-row")}
    >
      {customer ? (
        <CustomerRail items={nav} chrome={chrome} />
      ) : (
        <SideNav items={nav} chrome={chrome} />
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <PortalHeader chrome={chrome} />
        {/* Bottom padding below the bar's breakpoint: bar + raised Scan + home indicator, so nothing hides under it. */}
        <main
          id="main"
          className={cx(
            "min-w-0 flex-1 pb-[calc(var(--bottom-nav-h)+var(--scan-rise)+env(safe-area-inset-bottom,0px)+16px)]",
            customer ? "md:pb-0" : "lg:pb-0",
          )}
        >
          <RouteTransition>{children}</RouteTransition>
        </main>
      </div>
      <BottomNav items={nav} chrome={chrome} />
      {chrome.portal === "shop" ? <ActiveShopSync /> : null}
      <Toaster />
    </div>
  );
}
