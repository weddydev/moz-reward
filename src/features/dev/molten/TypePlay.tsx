"use client";

import { useRef } from "react";

/** The reference's type specimen: across the word, weight 200 → 900 and softness 100 → 0; back to 500 / 30. */
export function TypePlay({ children }: { children: string }): React.JSX.Element {
  const ref = useRef<HTMLParagraphElement>(null);
  return (
    <p
      ref={ref}
      className="m-type-play"
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        el.style.setProperty("--w", String(Math.round(200 + k * 700)));
        el.style.setProperty("--soft", String(Math.round(100 - k * 100)));
      }}
      onPointerLeave={() => {
        ref.current?.style.setProperty("--w", "500");
        ref.current?.style.setProperty("--soft", "30");
      }}
    >
      {children}
    </p>
  );
}
