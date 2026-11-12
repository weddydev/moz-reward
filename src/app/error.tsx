"use client";

import { RouteError } from "@/features/portal/RouteError";

/** Errors outside the portal groups, and errors thrown by a group's own layout (its gate): no shell. */
export default function RootError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}): React.JSX.Element {
  return <RouteError as="main" error={error} retry={retry} />;
}
