"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { secondaryButtonClass } from "./AuthCard";

export function SignOutButton({ to = "/" }: { to?: string }): React.JSX.Element {
  const router = useRouter();
  return (
    <button
      type="button"
      className={secondaryButtonClass}
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
