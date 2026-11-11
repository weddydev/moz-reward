"use client";

import { Overlay, type OverlayProps } from "./Overlay";

/** Centred dialog for desktop (DESIGN §6): fades and scales from .96, stays centred (not trigger-anchored). */
export function Modal(props: OverlayProps): React.JSX.Element | null {
  return <Overlay kind="modal" {...props} />;
}
