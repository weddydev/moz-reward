"use client";

import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { trapTab } from "./focus-trap";
import { IconButton } from "./IconButton";
import { currentTrigger, trackTriggers } from "./overlay-trigger";
import { lockScroll } from "./scroll-lock";
import { useSheetDrag } from "./use-sheet-drag";

export type OverlayKind = "modal" | "panel" | "sheet";

export type OverlayProps = {
  /** Controlled: the overlay shows while true and plays its exit when it turns false. */
  open: boolean;
  /** Close button, Esc, backdrop tap and (BottomSheet) a drag ask to close through this. */
  onClose: () => void;
  /** Visible heading and the dialog's accessible name. */
  title: string;
  /** Short text under the title; becomes the dialog's description. */
  description?: ReactNode;
  children?: ReactNode;
  /** Actions pinned under the scrolling content. */
  footer?: ReactNode;
  /** Focused on open. Default: the dialog itself, so a screen reader reads its name first and Tab starts at the top. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
};

type Phase = "closed" | "open" | "closing";

/**
 * The one overlay engine behind Modal, SidePanel and BottomSheet (P0-09 AC 2, 3, 11). A modal `<dialog>` in a
 * portal: the browser puts it in the top layer and makes the page behind inert to pointer and assistive tech.
 * On top of that: Tab/Shift+Tab cycle inside it; Esc closes the top overlay only (each dialog listens on itself,
 * and portals keep stacked dialogs out of each other's DOM); focus returns to the trigger, or stays on the page
 * when the trigger is gone; the page scroll is locked by a shared counter. Enter uses `@starting-style`, exit is
 * a state the CSS transitions to; the dialog closes once those transitions finish (interruptible: reopening
 * mid-exit reverses them). Motion: transform + opacity, ≤ 300ms, fade only under reduced motion (globals.css).
 */
export function Overlay({
  kind,
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocus,
  className,
}: OverlayProps & { kind: OverlayKind }): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>(open ? "open" : "closed");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const releaseScroll = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose);
  const hydrated = useHydrated();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(trackTriggers, []);
  const requestClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  // Follow the controlled prop (reopening mid-exit goes straight back to "open").
  if (open && phase !== "open") setPhase("open");
  else if (!open && phase === "open") setPhase("closing");

  const finish = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    releaseScroll.current?.();
    releaseScroll.current = null;
    const target = returnFocus.current;
    returnFocus.current = null;
    // Trigger removed while open: focus stays on the page (the browser falls back to <body>), no error.
    if (target?.isConnected) target.focus({ preventScroll: true });
    setPhase("closed");
  }, []);

  // Open: into the top layer, lock the page, move focus in.
  useLayoutEffect(() => {
    if (phase !== "open") return;
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog || !panel) return;
    if (!dialog.open) {
      // Remember the trigger before showModal() moves focus.
      returnFocus.current = currentTrigger();
      dialog.showModal();
    }
    releaseScroll.current ??= lockScroll();
    panel.style.transform = "";
    delete panel.dataset.keepTransform;
    const target = initialFocus?.current ?? panel;
    if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
      target.focus({ preventScroll: true });
    }
  }, [phase, hydrated, initialFocus]);

  // Close: let the exit transitions finish (a drag hands over its current position), then leave the top layer.
  useLayoutEffect(() => {
    if (phase !== "closing") return;
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (panel && panel.dataset.keepTransform === undefined) panel.style.transform = "";
    if (backdrop) backdrop.style.opacity = "";
    let cancelled = false;
    const animations = [panel, backdrop].flatMap((el) =>
      el && typeof el.getAnimations === "function" ? el.getAnimations() : [],
    );
    void Promise.allSettled(animations.map((a) => a.finished)).then(() => {
      if (!cancelled) finish();
    });
    return () => {
      cancelled = true;
    };
  }, [phase, finish]);

  // A body that scrolls must be reachable by keyboard (axe scrollable-region-focusable); one that fits is not a stop.
  useEffect(() => {
    const body = bodyRef.current;
    if (phase !== "open" || !body || typeof ResizeObserver === "undefined") return;
    const update = () => {
      if (body.scrollHeight > body.clientHeight + 1) body.tabIndex = 0;
      else body.removeAttribute("tabindex");
    };
    const observer = new ResizeObserver(update);
    observer.observe(body);
    for (const child of body.children) observer.observe(child);
    update();
    return () => {
      observer.disconnect();
    };
  }, [phase, hydrated]);

  // Unmounted while open (route change): give the page back.
  useEffect(
    () => () => {
      releaseScroll.current?.();
      releaseScroll.current = null;
    },
    [],
  );

  // Keyboard and native close paths, on the dialog itself (never the document), so only the top one reacts.
  useEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (phase === "closed" || !dialog || !panel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (dialog.dataset.state === "open") requestClose();
        return;
      }
      trapTab(e, panel);
    };
    // Esc that reached the browser's own dialog handling (e.g. a close request from assistive tech).
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (dialog.dataset.state === "open") requestClose();
    };
    // The browser closed it without us (a forced close request): tidy up and tell the parent.
    const onNativeClose = () => {
      if (dialog.dataset.state === "open") requestClose();
      finish();
    };
    dialog.addEventListener("keydown", onKeyDown);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onNativeClose);
    };
  }, [phase, hydrated, requestClose, finish]);

  useSheetDrag(
    kind === "sheet" && phase === "open" && hydrated,
    { panel: panelRef, backdrop: backdropRef, grip: gripRef, body: bodyRef },
    requestClose,
  );

  if (phase === "closed" || !hydrated) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="overlay"
      data-kind={kind}
      data-state={phase}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div
        ref={backdropRef}
        className="overlay-backdrop"
        aria-hidden="true"
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        data-part="panel"
        className={cx("overlay-panel bg-surface text-ink shadow-2", className)}
      >
        <div ref={gripRef} data-part="grip" className="overlay-grip">
          {kind === "sheet" && (
            <div className="overlay-handle" aria-hidden="true">
              <span className="bg-line rounded-pill block h-1 w-9" />
            </div>
          )}
          <div className="flex items-start gap-3 px-5 pt-4 pb-3 sm:px-6">
            <div className="min-w-0 flex-1 pt-2">
              <h2 id={titleId} className="text-h3 [overflow-wrap:anywhere]">
                {title}
              </h2>
              {description && (
                <p
                  id={descriptionId}
                  className="text-small text-ink-2 mt-1 [overflow-wrap:anywhere]"
                >
                  {description}
                </p>
              )}
            </div>
            <IconButton icon={X} label="Close" onClick={requestClose} className="-mr-2" />
          </div>
        </div>
        <div
          ref={bodyRef}
          data-part="body"
          role="region"
          aria-labelledby={titleId}
          className="overlay-body px-5 pb-5 sm:px-6"
        >
          {children}
        </div>
        {footer && (
          <div
            data-part="footer"
            className="border-line flex flex-wrap justify-end gap-3 border-t px-5 py-4 sm:px-6"
          >
            {footer}
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
