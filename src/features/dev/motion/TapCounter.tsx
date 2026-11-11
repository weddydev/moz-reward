"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** Proves a destination page is live while its transition runs (P0-10 AC 2): taps register at once. */
export function TapCounter(): React.JSX.Element {
  const [taps, setTaps] = useState(0);
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        onClick={() => {
          setTaps((n) => n + 1);
        }}
      >
        Tap me
      </Button>
      <p className="text-small text-ink-2" data-testid="tap-count" aria-live="polite">
        {taps === 1 ? "1 tap" : `${String(taps)} taps`}
      </p>
    </div>
  );
}
