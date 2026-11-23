"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { peekHero } from "@/lib/motion/hero-handoff";
import { SHOP_PAGE_CLASS, ShopPageHeader } from "./ShopPageHeader";

/**
 * The shop page while it loads (P1-07; PD-08 cover). Arriving from a Wallet card, it shows the cover with that
 * card's logo and name in their places at once (the photo shimmers until the page brings it), so the card morphs
 * into them even though the page commits this fallback first; the page then puts the same cover in the same
 * place. Otherwise (a full load, a typed URL) the cover is a skeleton of the same size. Read once on mount: a
 * re-render after the handoff expires must not swap the header for a skeleton. On the server and on a full
 * load's hydration no handoff exists, so both render the skeleton.
 */
export function ShopPageLoading(): React.JSX.Element {
  const pathname = usePathname();
  const [hero] = useState(() => peekHero(pathname));
  return (
    <div role="status" data-page="loading" className={SHOP_PAGE_CLASS}>
      <span className="sr-only">Loading</span>
      {hero ? (
        <ShopPageHeader shopId={hero.id} name={hero.name} logoUrl={hero.imageUrl} loading rise />
      ) : (
        <Skeleton className="m-cover" rounded="lg" />
      )}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
        <Skeleton className="h-56 w-full" rounded="lg" />
        <Skeleton className="h-56 w-full" rounded="lg" />
      </div>
    </div>
  );
}
