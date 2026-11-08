"use client";

import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeReturnTo } from "@/lib/return-to";
import { formValue, useHydrated } from "@/lib/use-hydrated";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./AuthCard";

export function CustomerSignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const returnTo = safeReturnTo(useSearchParams().get("returnTo"));
  const emailId = useId();
  const errorId = useId();
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = formValue(e.currentTarget, "email");
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setEmail(email);
    setError(null);
    setState("sending");
    const { error: err } = await authClient.signIn.magicLink({ email, callbackURL: returnTo });
    if (err) {
      setState("idle");
      setError(
        err.status === 429
          ? "Too many attempts — please wait a few minutes."
          : "Something went wrong — please try again.",
      );
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-[14px] bg-[#F7EDD0] p-4">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-[#5C564C]">
          We&apos;ve sent a sign-in link to <span className="font-semibold">{email}</span>. It works
          once and expires in 15 minutes.
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
          onClick={() => authClient.signIn.social({ provider: "google", callbackURL: returnTo })}
        >
          Continue with Google
        </button>
      ) : null}
      {googleEnabled ? (
        <p className="text-center text-sm text-[#8E877B]" aria-hidden="true">
          or
        </p>
      ) : null}
      <form method="post" onSubmit={sendLink} className="flex flex-col gap-3" noValidate>
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
          <p id={errorId} role="alert" className="text-sm text-[#B3432F]">
            {error}
          </p>
        ) : null}
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
