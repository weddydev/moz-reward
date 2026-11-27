"use client";

import { useEffect } from "react";
import { OFFLINE_SHELL_ATTR } from "./offline-shell";

/**
 * Drops a cached member card that isn't the signed-in account's (design check H1): any page loaded online signed
 * out (the sign-in pages included, so a second person's sign-in never sees the first one's card), or signed in
 * as someone else. Renders nothing; costs one Cache API lookup. The cache code loads after the page (C-91: this
 * guard is on every page, the code it needs isn't needed to draw any of them).
 */
export function CardCacheGuard({ owner }: { owner: string | null }): null {
  useEffect(() => {
    if (document.querySelector(`[${OFFLINE_SHELL_ATTR}]`)) return;
    void import("./card-cache")
      .then(async ({ cachedCardOwner, clearCardCache }) => {
        const cached = await cachedCardOwner();
        if (cached !== null && cached !== owner) await clearCardCache();
      })
      // A chunk that can't load (offline, a deploy mid-visit) leaves the card as it was: the next page tries again.
      .catch(() => undefined);
  }, [owner]);
  return null;
}
