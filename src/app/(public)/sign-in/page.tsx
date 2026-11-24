import { connection } from "next/server";
import { Suspense } from "react";
import { AuthCard, noticeClass } from "@/features/auth/AuthCard";
import { CustomerSignInForm } from "@/features/auth/CustomerSignInForm";
import { safeReturnTo } from "@/lib/return-to";
import { shopCodeFromReturnTo } from "@/lib/shop-return";
import { env } from "@/server/env";
import { findActiveShopName } from "@/server/repos/shops";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Coming from a shop's page: say which shop the customer is joining (DESIGN §15 screen 2). */
async function ShopContext({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).returnTo;
  const code = shopCodeFromReturnTo(safeReturnTo(typeof raw === "string" ? raw : null));
  const shopName = code ? await findActiveShopName(code) : null;
  if (!shopName) return null;
  return (
    <p className={noticeClass} data-testid="shop-context">
      Sign in to collect gold at <span className="font-semibold">{shopName}</span>.
    </p>
  );
}

async function SignInForm() {
  await connection(); // provider availability is runtime config, not build-time
  const e = env();
  return (
    <CustomerSignInForm googleEnabled={Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET)} />
  );
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): React.JSX.Element {
  return (
    <AuthCard title="Sign in" subtitle="Collect gold with every visit. No password needed.">
      <Suspense fallback={null}>
        <ShopContext searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="skeleton h-28 rounded-2xl" />}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
