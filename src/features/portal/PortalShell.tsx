import { RouteTransition } from "@/components/motion";
import { Toaster } from "@/components/ui";
import { PortalNav } from "./PortalNav";
import type { Portal, PortalRoute } from "./routes";

/**
 * The frame every portal page sits in (P0-12): navigation, the page content, the toast region. Rendered by
 * the group layout only **after** its gate allowed the request, so a portal-level deny shows no shell.
 *
 * Only the page content is inside `RouteTransition`. The bottom nav and the Toaster are `position: fixed`
 * and stay outside it: sliding content has a transform, which would make it their containing block.
 * `<main id="main">` is here (the skip link's target), so portal pages render no `<main>` of their own.
 */
export function PortalShell({
  portal,
  nav,
  children,
}: {
  portal: Portal;
  nav: readonly PortalRoute[];
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div data-portal={portal} className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <PortalNav portal={portal} items={nav} />
      {/* Bottom padding = the fixed bar's height + the home-indicator inset, so nothing hides under it. */}
      <main
        id="main"
        className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
      >
        <RouteTransition>{children}</RouteTransition>
      </main>
      <Toaster />
    </div>
  );
}
