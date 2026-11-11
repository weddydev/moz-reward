import { RouteTransition, TransitionLink } from "@/components/motion";
import { DemoTabBar } from "@/features/dev/motion/DemoTabBar";

/** Tab demo: the bar stays put; only the tab's content slides, in tab order. */
export default function MotionTabsLayout({
  children,
}: LayoutProps<"/dev/motion/tabs">): React.JSX.Element {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-10">
      <TransitionLink
        href="/dev/motion"
        direction="back"
        className="text-small text-ink-2 font-semibold underline"
      >
        ← Motion gallery
      </TransitionLink>
      <DemoTabBar />
      <RouteTransition className="bg-surface shadow-1 rounded-md p-6">{children}</RouteTransition>
    </main>
  );
}
