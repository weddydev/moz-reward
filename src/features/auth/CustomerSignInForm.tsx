"use client";

import { useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Turnstile } from "@/components/security/Turnstile";
import { authClient } from "@/lib/auth-client";
import { safeReturnTo } from "@/lib/return-to";
import { TURNSTILE_HEADER } from "@/lib/turnstile";
import { formValue, useHydrated } from "@/lib/use-hydrated";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./AuthCard";
import { networkErrorMessage } from "./network";

/** Pragmatic shape check; the server validates again. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LINK_EXPIRED_PATH = "/sign-in/link-expired";

function messageFor(err: { status: number; message?: string | undefined }): string {
  if (err.status === 429)
    return "Too many sign-in links requested. Please wait a while and try again.";
  if (err.status === 400 && err.message?.includes("security check")) return err.message;
  if (err.status === 400) return "Enter a valid email address, like name@example.com.";
  return "Something went wrong. Please try again.";
}

export function CustomerSignInForm({
  googleEnabled,
}: {
  googleEnabled: boolean;
}): React.JSX.Element {
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const emailId = useId();
  const errorId = useId();
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    params.get("error") === "google"
      ? "Google sign-in didn't finish. Please try again, or use an email link."
      : null,
  );
  // Synchronous guard: state updates are async, so a fast double submit could otherwise send twice.
  const inFlight = useRef(false);
  const turnstileToken = useRef("");
  // A Turnstile token is single-use: remount the widget after every attempt to get a fresh one.
  const [challenge, setChallenge] = useState(0);

  async function sendLink(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const value = formValue(e.currentTarget, "email");
    if (!value) {
      setError("Please enter your email address.");
      return;
    }
    if (!EMAIL.test(value)) {
      setError("Enter a valid email address, like name@example.com.");
      return;
    }
    if (!turnstileToken.current) {
      setError("Please complete the security check and try again.");
      return;
    }
    inFlight.current = true;
    setEmail(value);
    setError(null);
    setState("sending");
    try {
      const { error: err } = await authClient.signIn.magicLink({
        email: value,
        callbackURL: returnTo,
        errorCallbackURL: LINK_EXPIRED_PATH,
        fetchOptions: { headers: { [TURNSTILE_HEADER]: turnstileToken.current } },
      });
      if (err) {
        setState("idle");
        setError(messageFor(err));
        return;
      }
      setState("sent");
    } catch {
      // Network failure (offline, DNS, server unreachable): better-fetch throws instead of returning.
      setState("idle");
      setError(networkErrorMessage());
    } finally {
      inFlight.current = false;
      turnstileToken.current = "";
      setChallenge((n) => n + 1);
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="bg-gold-100 rounded-md p-4">
        <p className="font-semibold">Check your email</p>
        <p className="text-ink-2 mt-1">
          We&apos;ve sent a sign-in link to{" "}
          <span className="font-semibold wrap-anywhere">{email}</span>. It works once and expires in
          15 minutes.
        </p>
      </div>
    );
  }

  return (
    <>
      {googleEnabled ? (
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() =>
            void authClient.signIn.social({
              provider: "google",
              callbackURL: returnTo,
              errorCallbackURL: "/sign-in?error=google",
            })
          }
        >
          Continue with Google
        </button>
      ) : null}
      {googleEnabled ? (
        <p className="text-ink-2 text-center text-sm" aria-hidden="true">
          or
        </p>
      ) : null}
      <form
        method="post"
        onSubmit={(e) => void sendLink(e)}
        className="flex flex-col gap-3"
        noValidate
      >
        <label htmlFor={emailId} className="text-sm font-semibold">
          Email
        </label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          name="email"
          maxLength={254}
          className={inputClass}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
        <Turnstile
          key={challenge}
          action="magic-link"
          onToken={(t) => {
            turnstileToken.current = t;
          }}
        />
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={!hydrated || state === "sending"}
        >
          {state === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </>
  );
}
