import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/AuthCard";
import { EnrolTotp } from "@/features/auth/EnrolTotp";
import { SignedInDevices } from "@/features/auth/SignedInDevices";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { isPrivilegedUser } from "@/server/auth/privileged";
import { getSession } from "@/server/auth/session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function StaffSecurityPage(): Promise<React.JSX.Element> {
  // Checked before anything streams: a signed-out visitor gets a real 307, not a client-side redirect.
  const session = await getSession();
  if (!session) redirect("/staff/sign-in?returnTo=/staff/security");
  // Customers have no staff set-up to do (no password): send them to their own devices page (P0-B QA).
  if (!(await isPrivilegedUser(session.user.id))) redirect("/me/security");
  return (
    <AuthCard title="Two-step verification">
      {session.user.twoFactorEnabled ? (
        <>
          <p className="bg-gold-100 rounded-md p-3">
            Two-step verification is on for{" "}
            <span className="font-semibold">{session.user.email}</span>.
          </p>
          <SignOutButton to="/staff/sign-in" />
          <Suspense
            fallback={
              <div className="bg-surface-2 h-48 animate-pulse rounded-md motion-reduce:animate-none" />
            }
          >
            <SignedInDevices signInPath="/staff/sign-in" />
          </Suspense>
        </>
      ) : (
        <EnrolTotp />
      )}
    </AuthCard>
  );
}
