import { RouteContent } from "./RouteContent";

/**
 * Wrap a layout's `{children}` (the part that changes between pages; nav bars outside). On each navigation
 * the arriving content fades in and slides in the direction its `TransitionLink` recorded (DESIGN §7): the
 * live content moves, never a snapshot, so it stays tappable (DECISIONS "Pages slide as live content").
 * May nest: the innermost one whose page changed animates, its ancestors hold still.
 */
export function RouteTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return <RouteContent {...(className ? { className } : {})}>{children}</RouteContent>;
}
