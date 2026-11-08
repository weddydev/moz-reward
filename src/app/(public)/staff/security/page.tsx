import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/AuthCard";
import { EnrolTotp } from "@/features/auth/EnrolTotp";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { getSession } from "@/server/auth/session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Two-step verification" };

async function SecurityContent() {
  const session = await getSession();
  if (!session) redirect("/staff/sign-in?returnTo=/staff/security");
  if (session.user.twoFactorEnabled) {
    return (
      <>
        <p role="status" className="bg-gold-100 rounded-md p-3">
          Two-step verification is on for{" "}
          <span className="font-semibold">{session.user.email}</span>.
        </p>
        <SignOutButton to="/staff/sign-in" />
      </>
    );
  }
  return <EnrolTotp />;
}

export default function StaffSecurityPage(): React.JSX.Element {
  return (
    <AuthCard title="Two-step verification">
      <Suspense
        fallback={
          <div className="bg-surface-2 h-48 animate-pulse rounded-md motion-reduce:animate-none" />
        }
      >
        <SecurityContent />
      </Suspense>
    </AuthCard>
  );
}
