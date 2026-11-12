import { EmptyState } from "@/components/ui";

/** A portal page whose feature isn't built yet: the real title and an empty state (P0-12). */
export function PlaceholderPage({
  title,
  message,
}: {
  title: string;
  message: string;
}): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <h1 className="text-h1">{title}</h1>
      <EmptyState title="Nothing here yet" message={message} />
    </div>
  );
}
