import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/AuthCard";
import { StaffSignInForm } from "@/features/auth/StaffSignInForm";

export const metadata: Metadata = { title: "Staff sign in" };

export default function StaffSignInPage() {
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
