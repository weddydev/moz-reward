import { CircleAlert } from "lucide-react";
import { cx } from "@/lib/cx";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * Error state for a data-driven view (ENGINEERING §5): what went wrong in plain words and, when it can
 * help, a retry. Announced when it appears (`role="alert"`). While `retrying`, the button keeps its place
 * and focus but swallows presses (Button `loading`).
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cx(
        "border-line bg-surface flex flex-col items-center gap-3 rounded-md border px-6 py-8 text-center",
        className,
      )}
    >
      <div role="alert" className="flex flex-col items-center gap-2">
        <Icon icon={CircleAlert} size={32} className="text-danger" />
        <p className="text-h3">{title}</p>
        <p className="text-small text-ink-2 max-w-sm [overflow-wrap:break-word]">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size={48} loading={retrying} onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
