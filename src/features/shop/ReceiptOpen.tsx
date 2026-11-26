"use client";

import { lazy, Suspense, useState } from "react";
import type { CelebrationReceipt } from "@/lib/celebration";

const loadSheet = () => import("./ReceiptSheet");
const ReceiptSheet = lazy(loadSheet);

/**
 * A recent receipt's title as a button (P1-15): opening it prints the receipt in a sheet (DESIGN §8.5). The
 * sheet's chunk loads on the first press or focus only.
 */
export function ReceiptOpen({
  title,
  receipt,
  pdfHref,
}: {
  title: string;
  receipt: CelebrationReceipt;
  pdfHref: string;
}): React.JSX.Element {
  const [state, setState] = useState<"never" | "open" | "closed">("never");
  const [run, setRun] = useState(0);
  return (
    <>
      <button
        type="button"
        className="text-small hit-44 text-left font-semibold underline-offset-2 hover:underline"
        // The sheet's chunk starts loading on press (or focus), so the tap that opens it isn't kept waiting.
        onPointerDown={() => {
          void loadSheet();
        }}
        onFocus={() => {
          void loadSheet();
        }}
        onClick={() => {
          setRun((n) => n + 1);
          setState("open");
        }}
        data-testid="shop-receipt-open"
      >
        {title}
      </button>
      {state === "never" ? null : (
        <Suspense fallback={null}>
          <ReceiptSheet
            receipt={receipt}
            pdfHref={pdfHref}
            open={state === "open"}
            run={run}
            onClose={() => {
              setState("closed");
            }}
          />
        </Suspense>
      )}
    </>
  );
}
