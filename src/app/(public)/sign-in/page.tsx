import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/AuthCard";
import { CustomerSignInForm } from "@/features/auth/CustomerSignInForm";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Sign in" };

async function SignInForm() {
  await connection(); // provider availability is runtime config, not build-time
  const e = env();
  return (
    <CustomerSignInForm googleEnabled={Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET)} />
  );
}

export default function SignInPage() {
  return (
    <AuthCard title="Sign in" subtitle="Collect gold with every visit. No password needed.">
      <Suspense
        fallback={
          <div className="h-28 animate-pulse rounded-[14px] bg-[#F4EEE2] motion-reduce:animate-none" />
        }
      >
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
