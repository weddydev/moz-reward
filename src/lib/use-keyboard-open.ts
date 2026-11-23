"use client";

import { useEffect, useState } from "react";
import { keyboardOpen } from "@/lib/motion/controls";

/** Elements that bring up the on-screen keyboard when focused. */
export function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const nonText = [
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ];
    return !nonText.includes(el.type) && !el.readOnly && !el.disabled;
  }
  return false; // selects open a picker, not a keyboard
}

/**
 * Whether the on-screen keyboard is open (PD-07: the dock hides so it never rides on top of the keyboard on
 * Android or covers the field being typed into). Judged from the visual viewport (`keyboardOpen`); re-checked on
 * its resize, on focus changes and once on mount. Always false where `visualViewport` is missing.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = (): void => {
      setOpen(keyboardOpen(window.innerHeight, vv.height, isEditable(document.activeElement)));
    };
    vv.addEventListener("resize", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    // Read once now too: a field focused (and the keyboard opened) before this hydrated sent no event we heard.
    check();
    return () => {
      vv.removeEventListener("resize", check);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  }, []);
  return open;
}
