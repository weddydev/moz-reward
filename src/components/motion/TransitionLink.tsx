import Link from "next/link";
import { NAV, type NavType, tabTransitionTypes } from "@/lib/motion/route-transitions";

type LinkProps = React.ComponentProps<typeof Link>;

/**
 * A `next/link` that tells the page transition which way to go: `forward` (deeper: slides left), `back`
 * (up/out: slides right), or a tab move (`tab: { from, to }` positions in the nav order). Without a
 * direction it is a plain Link (cross-fade only).
 */
export function TransitionLink({
  direction,
  tab,
  ...props
}: Omit<LinkProps, "transitionTypes"> & {
  direction?: "forward" | "back";
  tab?: { from: number; to: number };
}): React.JSX.Element {
  const types: NavType[] = tab
    ? tabTransitionTypes(tab.from, tab.to)
    : direction
      ? [direction === "forward" ? NAV.forward : NAV.back]
      : [];
  return <Link {...props} {...(types.length > 0 ? { transitionTypes: types } : {})} />;
}
