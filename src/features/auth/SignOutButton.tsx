"use client";

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
      onClick={() => {
        // A full page load (P0-12): nothing of the signed-in pages stays in the router cache.
        void authClient.signOut().then(() => {
          window.location.assign(to);
        });
      }}
    >
      Sign out
    </button>
  );
}
