"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FxCanvas } from "./FxCanvas";

/**
 * The particle canvas for a moment inside a modal dialog (P1-15). A modal `<dialog>` is in the top layer, above
 * the root layout's canvas, so bursts drawn there would be hidden behind it. This mounts a second canvas in the
 * dialog itself (portalled to the `<dialog>`, outside the panel's transform, so `position: fixed` still means
 * the viewport); `mountFx` gives it the engine while it is mounted and hands back to the root canvas after.
 */
export function DialogFx(): React.JSX.Element {
  const probe = useRef<HTMLSpanElement>(null);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  useLayoutEffect(() => {
    setDialog(probe.current?.closest("dialog") ?? null);
  }, []);
  return (
    <>
      <span ref={probe} hidden />
      {dialog ? createPortal(<FxCanvas />, dialog) : null}
    </>
  );
}
