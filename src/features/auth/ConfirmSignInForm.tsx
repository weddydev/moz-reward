"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { primaryButtonClass } from "./AuthCard";

/**
 * The confirm page's form (P0-19). Still a plain POST, so it works before hydration and without JavaScript;
 * once hydrated, a second press is ignored and the button says "Signing in…". A double tap would otherwise
 * send the single-use token twice, and the browser would keep the second answer ("link expired") and drop
 * the first one, which carried the session cookie.
 */
export function ConfirmSignInForm({
  action,
  token,
  returnTo,
  children,
}: {
  action: string;
  token: string;
  returnTo: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const sent = useRef(false);
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();
  // Back button after a failed sign-in restores this page from the back-forward cache: allow a new press.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      sent.current = false;
      setPending(false);
    };
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
    };
  }, []);
  return (
    <form
      method="post"
      action={action}
      className="grid gap-4"
      data-hydrated={hydrated ? "" : undefined}
      onSubmit={(e) => {
        if (sent.current) {
          e.preventDefault();
          return;
        }
        sent.current = true;
        setPending(true);
      }}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {children}
      <button type="submit" className={primaryButtonClass} aria-disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
