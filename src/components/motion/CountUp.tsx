"use client";

import { useRef, useState } from "react";
import { formatCount } from "@/lib/motion/press";
import { useHydrated } from "@/lib/use-hydrated";
import { useCountUp } from "./press";

/**
 * A number that counts up to `value` (PD-06; reference `countUp`, cubic out): from the previous value when it
 * changes, and from 0 when it mounts after hydration (a tab panel shown by a tap). The server render and the
 * hydration render show the value as it is. The moving digits are hidden from assistive technology; a visually
 * hidden copy carries the final number, so a screen reader (or an `aria-live` region around it) never reads a
 * value mid-count (PD-A design review follow-up). Under reduced motion the value shows at once.
 */
export function CountUp({
  value,
  ms,
  className,
}: {
  value: number;
  ms?: number;
  className?: string;
}): React.JSX.Element {
  const hydrated = useHydrated();
  // Fixed at the first render: true when React mounts it on the client after hydration.
  const [clientMount] = useState(hydrated);
  const digits = useRef<HTMLSpanElement>(null);
  useCountUp(digits, value, ms, clientMount ? 0 : undefined);
  const text = formatCount(value);
  return (
    <span className={className}>
      <span ref={digits} aria-hidden="true">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
