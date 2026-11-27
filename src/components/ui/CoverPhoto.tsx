"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * A shop's cover photo that steps aside when it can't load (a missing or broken file): the cover's own ground
 * shows instead of the browser's broken-image glyph (WebKit draws a "?"; PD-A QA). The check also catches an
 * image that failed before hydration (`complete` with no pixels), when React never saw its `error` event.
 * The photo itself (a `ShopImage`) comes in as `children`, rendered where the caller is: from a server component it
 * ships no image code to the browser (C-91).
 */
export function CoverPhoto({
  src,
  children,
}: {
  /** The photo's source: a new one gets a fresh chance after a failure. */
  src: string;
  children: ReactNode;
}): React.JSX.Element | null {
  const box = useRef<HTMLSpanElement>(null);
  const [broken, setBroken] = useState<string | null>(null);
  useEffect(() => {
    const img = box.current?.querySelector("img");
    if (!img) return;
    const fail = (): void => {
      setBroken(src);
    };
    if (img.complete && img.naturalWidth === 0) fail();
    img.addEventListener("error", fail);
    return () => {
      img.removeEventListener("error", fail);
    };
  }, [src]);
  if (broken === src) return null;
  return (
    <span ref={box} className="contents">
      {children}
    </span>
  );
}
