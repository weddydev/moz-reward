import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * A portal page whose feature isn't built yet: the real title and an empty state (P0-12) on a placed card
 * (PD-11), so it sits on the living background like every other surface.
 */
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
      <Card data-testid="placeholder-card">
        <EmptyState title="Nothing here yet" message={message} />
      </Card>
    </div>
  );
}
