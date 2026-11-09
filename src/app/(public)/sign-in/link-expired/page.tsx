import Link from "next/link";
import { AuthCard, primaryButtonClass, secondaryButtonClass } from "@/features/auth/AuthCard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Link expired" };

/**
 * Where a used, expired or invalid sign-in link lands (P0-06). Better Auth adds `?error=<code>`. The copy
 * never says whether an account exists.
 */
export default async function LinkExpiredPage({
  searchParams,
}: PageProps<"/sign-in/link-expired">): Promise<React.JSX.Element> {
  const error = (await searchParams).error;
  const staffOnly = error === "FORBIDDEN";
  return (
    <AuthCard
      title={staffOnly ? "Use your staff sign-in" : "This link has expired"}
      subtitle={
        staffOnly
          ? "Staff and admin accounts sign in with a password and two-step verification."
          : "Sign-in links work once and expire after 15 minutes. This one has already been used or is too old."
      }
    >
      {staffOnly ? (
        <Link href="/staff/sign-in" className={`${primaryButtonClass} grid place-items-center`}>
          Go to staff sign-in
        </Link>
      ) : (
        <>
          <Link href="/sign-in" className={`${primaryButtonClass} grid place-items-center`}>
            Send me a new link
          </Link>
          <p className="text-ink-2 text-sm">
            Tip: if you asked for more than one link, use the newest email.
          </p>
        </>
      )}
      {staffOnly ? null : (
        <Link href="/" className={`${secondaryButtonClass} grid place-items-center`}>
          Back to home
        </Link>
      )}
    </AuthCard>
  );
}
