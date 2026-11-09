import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/AuthCard";
import { SignedInDevices } from "@/features/auth/SignedInDevices";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { getSession } from "@/server/auth/session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Signed-in devices" };

/** Customer: signed-in devices + sign out everywhere (SECURITY §2). Moves into the Me tab with P0-12. */
async function DevicesContent() {
  const session = await getSession();
  if (!session) redirect("/sign-in?returnTo=/me/security");
  return (
    <>
      <SignedInDevices signInPath="/sign-in" />
      <SignOutButton to="/sign-in" />
    </>
  );
}

export default function CustomerSecurityPage(): React.JSX.Element {
  return (
    <AuthCard title="Your devices" subtitle="Where you're signed in to Moz Rewards.">
      <Suspense
        fallback={
          <div className="bg-surface-2 h-48 animate-pulse rounded-md motion-reduce:animate-none" />
        }
      >
        <DevicesContent />
      </Suspense>
    </AuthCard>
  );
}
