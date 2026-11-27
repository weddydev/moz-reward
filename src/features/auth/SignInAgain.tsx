"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { safeReturnTo } from "@/lib/return-to";

/** Where "Sign in" goes for a session that ended mid-action: the portal's sign-in, then back to this page. */
export function signInAgainHref(base: "/sign-in" | "/staff/sign-in", path: string): string {
  return `${base}?returnTo=${encodeURIComponent(safeReturnTo(path))}`;
}

/**
 * The way on after an action answered UNAUTHENTICATED ("Please sign in to continue."): a Sign in link that
 * comes back to the same page (P1-D close QA MINOR 4). Customers sign in at `/sign-in`, the team at
 * `/staff/sign-in`.
 */
export function SignInAgain({
  base,
  testId,
}: {
  base: "/sign-in" | "/staff/sign-in";
  testId?: string;
}): React.JSX.Element {
  const path = usePathname();
  return (
    <Link
      href={signInAgainHref(base, path)}
      className="hit-44 font-semibold underline underline-offset-4"
      data-testid={testId}
    >
      Sign in
    </Link>
  );
}
