"use client";

import { Overlay, type OverlayProps } from "./Overlay";

/** Dashboard side panel (DESIGN §6): full height from the right, slides in its own width. */
export function SidePanel(props: OverlayProps): React.JSX.Element | null {
  return <Overlay kind="panel" {...props} />;
}
