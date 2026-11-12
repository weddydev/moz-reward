"use client";

import { RouteError } from "@/features/portal/RouteError";

/** Errors thrown by a shop portal page: shown inside the shell, so the navigation still works. */
export default function ShopError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}): React.JSX.Element {
  return <RouteError error={error} retry={retry} />;
}
