import { notFound } from "next/navigation";
import { DEMO_TABS, demoTabIndex } from "@/features/dev/motion/demo-data";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Motion demo: tabs",
  robots: { index: false, follow: false },
};

export default async function MotionTabsPage({
  params,
}: PageProps<"/dev/motion/tabs/[tab]">): Promise<React.JSX.Element> {
  const { tab } = await params;
  const current = demoTabIndex(tab);
  if (current < 0) notFound();
  return (
    <>
      <h1 className="text-h2">{DEMO_TABS[current]?.label}</h1>
      <p className="text-ink-2 mt-2">
        Tab {String(current + 1)} of {String(DEMO_TABS.length)}. Later tabs slide in from the right,
        earlier ones from the left.
      </p>
    </>
  );
}
