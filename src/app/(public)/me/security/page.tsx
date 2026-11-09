import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/AuthCard";
import { SignedInDevices } from "@/features/auth/SignedInDevices";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { getSession } from "@/server/auth/session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Signed-in devices" };

/** Customer: signed-in devices + sign out everywhere (SECURITY §2). Moves into the Me tab with P0-12. */
export default async function CustomerSecurityPage(): Promise<React.JSX.Element> {
  // Checked before anything streams, so a signed-out visitor gets a real 307 (not a client-side redirect
  // that waits for JavaScript).
  if (!(await getSession())) redirect("/sign-in?returnTo=/me/security");
  return (
    <AuthCard title="Your devices" subtitle="Where you're signed in to Moz Rewards.">
      <Suspense
        fallback={
          <div className="bg-surface-2 h-48 animate-pulse rounded-md motion-reduce:animate-none" />
        }
      >
        <SignedInDevices signInPath="/sign-in" />
      </Suspense>
      <SignOutButton to="/sign-in" />
    </AuthCard>
  );
}
