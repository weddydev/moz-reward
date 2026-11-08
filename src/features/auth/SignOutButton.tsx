"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { secondaryButtonClass } from "./AuthCard";

export function SignOutButton({ to = "/" }: { to?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={secondaryButtonClass}
      onClick={async () => {
        await authClient.signOut();
        router.push(to);
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
