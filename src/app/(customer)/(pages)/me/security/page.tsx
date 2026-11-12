import { Suspense } from "react";
import { SignedInDevices } from "@/features/auth/SignedInDevices";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { gateCustomerRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Signed-in devices" };

/**
 * Me → signed-in devices + sign out everywhere (SECURITY §2). A customer portal page (P0-12, hidden from the
 * nav: Me stays active). The gate runs before anything streams, so a visitor gets a real 307 to sign-in.
 */
export default async function CustomerSecurityPage(): Promise<React.JSX.Element> {
  await gateCustomerRoute("/me/security");
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Your devices</h1>
        <p className="text-ink-2">Where you&apos;re signed in to Moz Rewards.</p>
      </div>
      <Suspense
        fallback={
          <div className="bg-surface-2 h-48 animate-pulse rounded-md motion-reduce:animate-none" />
        }
      >
        <SignedInDevices signInPath="/sign-in" />
      </Suspense>
      <SignOutButton to="/sign-in" />
    </div>
  );
}
