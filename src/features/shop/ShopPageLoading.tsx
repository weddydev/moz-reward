"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { peekHero } from "@/lib/motion/hero-handoff";
import { SHOP_COVER_CLASS, SHOP_PAGE_CLASS, ShopPageHeader } from "./ShopPageHeader";

/**
 * The shop page while it loads (P1-07; P1-09 layout). Arriving from a Wallet card, it shows that card's logo
 * and name in the page's header position at once, so the card morphs into them even though the page commits
 * this fallback first; the page then puts the same header in the same place (the cover above it is the same
 * box). Otherwise (a full load, a typed URL) the header is a skeleton of the same size. Read once on mount: a
 * re-render after the handoff expires must not swap the header for a skeleton. On the server and on a full
 * load's hydration no handoff exists, so both render the skeleton.
 */
export function ShopPageLoading(): React.JSX.Element {
  const pathname = usePathname();
  const [hero] = useState(() => peekHero(pathname));
  return (
    <div role="status" data-page="loading" className={SHOP_PAGE_CLASS}>
      <span className="sr-only">Loading</span>
      <div className="flex flex-col">
        <Skeleton className={SHOP_COVER_CLASS} rounded="lg" />
        {hero ? (
          <ShopPageHeader shopId={hero.id} name={hero.name} logoUrl={hero.imageUrl} loading />
        ) : (
          <div className="relative -mt-10 flex items-end gap-4 px-4 lg:px-6">
            <Skeleton className="border-surface size-20 shrink-0 border-4" />
            <Skeleton className="h-9 w-48" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
        <Skeleton className="h-56 w-full" rounded="lg" />
        <Skeleton className="h-56 w-full" rounded="lg" />
      </div>
    </div>
  );
}
