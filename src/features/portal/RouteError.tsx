"use client";

import { CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, Icon } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";

/** The server's reference for an error it already logged; absent on an error thrown in the browser. */
function digestOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  return typeof error.digest === "string" && error.digest.length > 0 ? error.digest : null;
}

/**
 * The page an `error.tsx` shows (P0-12, C-04): a generic line and the error's reference, never the error's
 * own text (it can carry internals). A server error is already logged and sent to Sentry under its digest;
 * one thrown in the browser is handed to `reportError`, which the browser Sentry handler picks up.
 */
export function RouteError({
  error,
  retry,
  as: Tag = "div",
}: {
  error: unknown;
  retry: () => void;
  as?: "main" | "div";
}): React.JSX.Element {
  const hydrated = useHydrated();
  const digest = digestOf(error);
  useEffect(() => {
    if (digest === null && typeof reportError === "function") reportError(error);
  }, [error, digest]);
  return (
    <Tag
      {...(Tag === "main" ? { id: "main" } : {})}
      data-page="error"
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center"
    >
      <div role="alert" className="flex flex-col items-center gap-4">
        <span className="bg-surface-2 text-danger grid size-16 place-items-center rounded-full">
          <Icon icon={CircleAlert} size={32} />
        </span>
        <h1 className="text-h1">Something went wrong</h1>
        <p className="text-body text-ink-2">
          Please try again. If it keeps happening, get in touch and we&apos;ll put it right.
        </p>
      </div>
      {/* A client handler: disabled until hydrated so an early press isn't lost (C-20). */}
      <Button className="mt-2" disabled={!hydrated} onClick={retry}>
        Try again
      </Button>
      {digest ? (
        <p className="text-small text-ink-2 [overflow-wrap:anywhere]">
          Reference: <span data-error-digest>{digest}</span>
        </p>
      ) : null}
    </Tag>
  );
}
