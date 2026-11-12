import { connection } from "next/server";
import { TransitionLink } from "@/components/motion";
import { TapCounter } from "@/features/dev/motion/TapCounter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Motion demo: slow page",
  robots: { index: false, follow: false },
};

/**
 * A destination that suspends (P0-10 edge case): the loading state enters with the page transition, then
 * the content replaces it in place with no second animation.
 */
export default async function MotionSlowPage(): Promise<React.JSX.Element> {
  await connection();
  await new Promise((resolve) => setTimeout(resolve, 700));
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-10">
      <TransitionLink
        href="/dev/motion"
        direction="back"
        className="text-small text-ink-2 hit-44 self-start font-semibold underline"
      >
        ← Motion gallery
      </TransitionLink>
      <h1 className="text-h1">Slow page</h1>
      <p className="text-ink-2">
        This page took a moment to load. Its loading state slid in first; the content then took its
        place without moving.
      </p>
      <TapCounter />
    </main>
  );
}
