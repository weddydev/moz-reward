import { RouteTransition } from "@/components/motion";

/** `/dev/motion` demos: pages under here slide per their navigation's type (P0-10). */
export default function MotionLayout({ children }: LayoutProps<"/dev/motion">): React.JSX.Element {
  return <RouteTransition>{children}</RouteTransition>;
}
