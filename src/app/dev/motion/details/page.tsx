import { TransitionLink } from "@/components/motion";
import { TapCounter } from "@/features/dev/motion/TapCounter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Motion demo: forward and back",
  robots: { index: false, follow: false },
};

/** A deeper page with no shared elements: forward slides it in from the right, back reverses (P0-10). */
export default function MotionDetailsPage(): React.JSX.Element {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-10">
      <TransitionLink
        href="/dev/motion"
        direction="back"
        className="text-small text-ink-2 hit-44 self-start font-semibold underline"
      >
        ← Motion gallery
      </TransitionLink>
      <h1 className="text-h1">Detail page</h1>
      <p className="text-ink-2">
        Arrived with a forward slide: 8px from the right with a fade. The back link reverses it.
      </p>
      <TapCounter />
    </main>
  );
}
