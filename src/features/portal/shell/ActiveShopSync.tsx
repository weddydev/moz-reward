"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ACTIVE_SHOP_CHANNEL } from "./ShopSwitcher";

/**
 * Keeps every open tab of the shop portal on the same shop (P0-12 QA): the active shop is a cookie, so after
 * a switch in one tab the server already answers for the new shop everywhere; this refreshes the other tabs'
 * shell and page at once, so no tab shows one shop's name over another shop's data.
 */
export function ActiveShopSync(): null {
  const router = useRouter();
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(ACTIVE_SHOP_CHANNEL);
      channel.onmessage = () => {
        router.refresh();
      };
    } catch {
      channel = null;
    }
    return () => {
      channel?.close();
    };
  }, [router]);
  return null;
}
