import { Skeleton } from "@/components/ui";

/** Loading state of the slow demo page: same layout as the page, so nothing shifts when it arrives. */
export default function MotionSlowLoading(): React.JSX.Element {
  return (
    <main
      id="main"
      aria-busy="true"
      className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-10"
    >
      <p className="sr-only" role="status">
        Loading the slow page
      </p>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-12 w-full" />
    </main>
  );
}
