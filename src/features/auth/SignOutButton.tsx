"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";
import { secondaryButtonClass } from "./AuthCard";

export function SignOutButton({ to = "/" }: { to?: string }): React.JSX.Element {
  const router = useRouter();
  // Disabled until React owns the page: a press before hydration would do nothing (P0-14).
  const hydrated = useHydrated();
  return (
    <button
      type="button"
      className={secondaryButtonClass}
      disabled={!hydrated}
      onClick={() => {
        void authClient.signOut().then(() => {
          router.push(to);
          router.refresh();
        });
      }}
    >
      Sign out
    </button>
  );
}
