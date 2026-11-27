"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { ShopImage } from "./ShopImage";

/**
 * A shop's cover photo that steps aside when it can't load (a missing or broken file): the cover's own ground
 * shows instead of the browser's broken-image glyph (WebKit draws a "?"; PD-A QA). The check also catches an
 * image that failed before hydration (`complete` with no pixels), when React never saw its `error` event.
 */
export function CoverPhoto(props: ComponentProps<typeof ShopImage>): React.JSX.Element | null {
  const box = useRef<HTMLSpanElement>(null);
  const [broken, setBroken] = useState<string | null>(null);
  useEffect(() => {
    const img = box.current?.querySelector("img");
    if (!img) return;
    const fail = (): void => {
      setBroken(props.src);
    };
    if (img.complete && img.naturalWidth === 0) fail();
    img.addEventListener("error", fail);
    return () => {
      img.removeEventListener("error", fail);
    };
  }, [props.src]);
  if (broken === props.src) return null;
  return (
    <span ref={box} className="contents">
      <ShopImage {...props} />
    </span>
  );
}
