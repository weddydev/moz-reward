"use client";

import { browserQueueStorage, clearQueue } from "@/features/shop/request-queue";
import { authClient } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";
import { secondaryButtonClass } from "./AuthCard";

export function SignOutButton({ to = "/" }: { to?: string }): React.JSX.Element {
  // Disabled until React owns the page: a press before hydration would do nothing (P0-14).
  const hydrated = useHydrated();
  return (
    <button
      type="button"
      className={secondaryButtonClass}
      disabled={!hydrated}
      // For the E2E axe guard, which waits for no [data-hydrating] (see DeviceList).
      data-hydrating={hydrated ? undefined : ""}
      onClick={() => {
        // A full page load (P0-12): nothing of the signed-in pages stays in the router cache. Requests queued
        // offline go with the session, once it has really ended: a sign-out that failed (offline) keeps them
        // (security review M1 and its re-check, P1-C close).
        void authClient.signOut().then((res) => {
          if (!res.error) clearQueue(browserQueueStorage());
          window.location.assign(to);
        });
      }}
    >
      Sign out
    </button>
  );
}
