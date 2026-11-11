"use client";

import { Overlay, type OverlayProps } from "./Overlay";

/**
 * Mobile bottom sheet (DESIGN §6, P0-09 AC 11): rises from the bottom; drag the handle or header down (or pull
 * the content down while it is scrolled to the top) past 25% of its height, or flick faster than 0.5 px/ms, to
 * close; anything less springs back. Close button, Esc and backdrop tap close it too. Safe-area padding below.
 */
export function BottomSheet(props: OverlayProps): React.JSX.Element | null {
  return <Overlay kind="sheet" {...props} />;
}
