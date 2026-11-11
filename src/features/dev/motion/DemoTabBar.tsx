"use client";

import { usePathname } from "next/navigation";
import { TransitionLink } from "@/components/motion";
import { cx } from "@/lib/cx";
import { DEMO_TABS, demoTabIndex } from "./demo-data";

/** The tab demo's bar: outside the tab content's transition, so it stays still while content slides. */
export function DemoTabBar(): React.JSX.Element {
  const current = demoTabIndex(usePathname().split("/").pop() ?? "");
  return (
    <nav aria-label="Demo tabs" className="bg-surface-2 rounded-pill grid grid-cols-3 p-1">
      {DEMO_TABS.map((t, i) => (
        <TransitionLink
          key={t.slug}
          href={`/dev/motion/tabs/${t.slug}`}
          tab={{ from: current, to: i }}
          aria-current={i === current ? "page" : undefined}
          className={cx(
            "hit-44 rounded-pill text-small flex h-10 items-center justify-center font-semibold",
            i === current ? "bg-surface shadow-1 text-ink" : "text-ink-2",
          )}
        >
          {t.label}
        </TransitionLink>
      ))}
    </nav>
  );
}
