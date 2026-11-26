import { OfflineView } from "@/features/member-card/OfflineView";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

/**
 * `/offline` (P1-14): the offline shell the service worker keeps and serves when a page can't load for lack of
 * network (public/sw.js). Public and session-free: the worker fetches it signed out, so the cached HTML holds no
 * account data; the member card comes from the worker's one cached card payload, read in the browser. The CSP
 * nonce in the cached copy is frozen with it; the page renders no HTML from data (React text only), so that stays
 * safe (design check L7).
 */
export default function OfflinePage(): React.JSX.Element {
  return (
    <main
      id="main"
      // OFFLINE_SHELL_ATTR (card-cache.ts): the card guard skips the shell.
      data-offline-shell=""
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-4 py-10"
    >
      <OfflineView />
    </main>
  );
}
