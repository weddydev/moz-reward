"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { type ComponentProps, useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { useHydrated } from "@/lib/use-hydrated";

/** The sheet's code (form, overlays, profile fields) is fetched the first time it is wanted (C-64). */
const loadSheet = () => import("./JoinSheet");
const JoinSheet = dynamic(() => loadSheet().then((m) => m.JoinSheet), { ssr: false });

type SheetProps = Omit<ComponentProps<typeof JoinSheet>, "open" | "onOpenChange">;

/**
 * "Collect points" for a signed-in visitor who isn't a member (PRODUCT §3, P1-04, C-52; P1-08 C-64): the CTA
 * ships with the landing page; the join sheet loads on demand, when the visitor taps it or arrives with
 * `?join=1` (back from sign-in). Before hydration the CTA is a link to `?join=1`, which opens the sheet once
 * the page is interactive. Hover, focus or a touch on the CTA starts the download early, so the sheet is
 * usually there by the time the tap lands. Once loaded, the sheet stays mounted: what was typed survives
 * closing and reopening it.
 */
export function JoinCta({
  autoOpen,
  ...sheet
}: SheetProps & { autoOpen: boolean }): React.JSX.Element {
  const hydrated = useHydrated();
  const [wanted, setWanted] = useState(autoOpen);
  const [open, setOpen] = useState(autoOpen);

  // `?join=1` (back from sign-in, or a tap before hydration) has done its job once the sheet is asked for.
  useEffect(() => {
    if (!autoOpen) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("join")) return;
    url.searchParams.delete("join");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [autoOpen]);

  const warm = (): void => {
    void loadSheet();
  };
  return (
    <>
      <Link
        href={`/s/${sheet.shopCode}?join=1`}
        className={buttonClasses({ size: 56, block: true })}
        data-testid="landing-collect"
        onPointerEnter={warm}
        onFocus={warm}
        onTouchStart={warm}
        onClick={(e) => {
          if (!hydrated) return;
          e.preventDefault();
          setWanted(true);
          setOpen(true);
        }}
      >
        Collect points
      </Link>
      {wanted ? <JoinSheet {...sheet} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
