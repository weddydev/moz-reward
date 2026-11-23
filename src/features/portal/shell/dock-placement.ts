import type { PortalRoute } from "../routes";

/** A tap the router hasn't committed yet: on page `from`, column `column` was tapped (-1: the Scan coin). */
export type PendingTap = { from: string; column: number };

/**
 * Pure: where the dock's gold sits (PD-07). The current page's column (More's when one of its pages is open;
 * none when the Scan coin is current), or, while a tap's navigation is on its way, the tapped column, so the
 * gold pours on the tap like the reference instead of waiting for the URL. A pending tap from another page is
 * stale (the navigation landed, or went elsewhere) and is ignored. `liquid` counts only the items the gold
 * can sit on (the Scan coin is skipped); -1 when it sits on none.
 */
export function dockPlacement({
  bar,
  rest,
  activePath,
  hasMore,
  pathname,
  pending,
}: {
  bar: readonly PortalRoute[];
  rest: readonly PortalRoute[];
  activePath: string | null;
  hasMore: boolean;
  pathname: string;
  pending: PendingTap | null;
}): { current: number; columns: number; column: number; liquid: number } {
  const current = bar.findIndex((r) => r.path === activePath);
  // Only a dock with a More item can hold the gold there (the customer dock has none: Notifications drains it).
  const moreActive = hasMore && rest.some((r) => r.path === activePath);
  const columns = bar.length + (hasMore ? 1 : 0);
  const settled = moreActive ? bar.length : bar[current]?.raised ? -1 : current;
  const column = pending && pending.from === pathname ? pending.column : settled;
  const liquid = column < 0 ? -1 : bar.slice(0, column).filter((r) => !r.raised).length;
  return { current, columns, column, liquid };
}

/** A plain primary click (no modifier, not already handled): one that navigates this tab. */
export function plainClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return (
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented
  );
}
