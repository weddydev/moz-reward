"use client";

import { useEffect } from "react";
import { cachedCardOwner, clearCardCache, OFFLINE_SHELL_ATTR } from "./card-cache";

/**
 * Drops a cached member card that isn't the signed-in account's (design check H1): any page loaded online signed
 * out (the sign-in pages included, so a second person's sign-in never sees the first one's card), or signed in
 * as someone else. Renders nothing; costs one Cache API lookup.
 */
export function CardCacheGuard({ owner }: { owner: string | null }): null {
  useEffect(() => {
    if (document.querySelector(`[${OFFLINE_SHELL_ATTR}]`)) return;
    void cachedCardOwner().then((cached) => {
      if (cached !== null && cached !== owner) return clearCardCache();
      return undefined;
    });
  }, [owner]);
  return null;
}
