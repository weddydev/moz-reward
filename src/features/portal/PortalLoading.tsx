import { Skeleton } from "@/components/ui";

/**
 * What a portal page shows while it loads (P0-12): the page's outline in the same container as the page,
 * so nothing jumps when the content arrives. Announced once as "Loading"; the blocks are decorative.
 */
export function PortalLoading(): React.JSX.Element {
  return (
    <div
      role="status"
      data-page="loading"
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8"
    >
      <span className="sr-only">Loading</span>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-28 w-full" rounded="lg" />
      <Skeleton className="h-28 w-full" rounded="lg" />
    </div>
  );
}
