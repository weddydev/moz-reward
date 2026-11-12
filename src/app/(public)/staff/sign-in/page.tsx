import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/AuthCard";
import { StaffSignInForm } from "@/features/auth/StaffSignInForm";
import { safeReturnTo } from "@/lib/return-to";
import { signedInStaffDestination } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Staff sign in" };

/**
 * C-05: a staff member or admin who is already signed in (with a session their portal accepts) goes to the
 * page they asked for, or their default portal. Anyone else, incl. a signed-in customer (a staff account may
 * be a different one), sees the form.
 */
export default async function StaffSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const home = await signedInStaffDestination();
  if (home) {
    const { returnTo } = await searchParams;
    redirect(typeof returnTo === "string" ? safeReturnTo(returnTo, home) : home);
  }
  return (
    <AuthCard title="Staff sign in" subtitle="For shop teams and Moz Rewards admins.">
      <Suspense
        fallback={
          <div className="bg-surface-2 h-48 animate-pulse rounded-md motion-reduce:animate-none" />
        }
      >
        <StaffSignInForm />
      </Suspense>
    </AuthCard>
  );
}
