import { ViewTransition } from "react";
import { PAGE_TRANSITION } from "@/lib/motion/route-transitions";
import { RouteContent } from "./RouteContent";

/**
 * Wrap a layout's `{children}` (the part that changes between pages; keep nav bars outside). The boundary
 * stays mounted, so a navigation is an `update` of it: typed navigations (`TransitionLink`, tab links) slide
 * per DESIGN §7, untyped ones (browser back/forward, refresh) only get the root cross-fade. React's
 * page-level `enter`/`exit` did not fire for our per-request pages (DECISIONS "Route transitions on a layout
 * boundary"). Without typed View Transitions, `RouteContent` plays the CSS fallback.
 */
export function RouteTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <ViewTransition update={PAGE_TRANSITION} default="none">
      <RouteContent {...(className ? { className } : {})}>{children}</RouteContent>
    </ViewTransition>
  );
}
