import { buttonClasses } from "@/components/ui/button-classes";
import { Card } from "@/components/ui/Card";
import type { ReactNode } from "react";

/**
 * The sign-in screens' frame (PD-11; extended from the reference: a placed card with the gilded edge on the
 * living background). Anchored near the top, not centred: a line that leaves on hydration (the "getting ready"
 * hint) then shortens the card at its foot and moves nothing above it (no layout shift; PD-A QA).
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[max(48px,12dvh)] pb-16"
    >
      <Card gilded className="rounded-[var(--r-lg)] p-6 sm:p-8" data-testid="auth-card">
        <h1 className="text-h1">{title}</h1>
        {subtitle ? <p className="text-ink-2 mt-2">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col gap-4">{children}</div>
      </Card>
    </main>
  );
}

/** The screens' main action (a submit button or a link styled as one): the molten button, full width. */
export const primaryButtonClass = buttonClasses({ variant: "molten", block: true });
/** A second action (Google, Back to home, Sign out): the orbit button, full width. */
export const secondaryButtonClass = buttonClasses({ variant: "orbit", block: true });
/** An info panel inside the card (the shop being joined, "check your email"). */
export const noticeClass = "rounded-2xl bg-[var(--ivory)] p-4";
