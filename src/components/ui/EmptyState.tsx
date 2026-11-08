import type { ReactNode } from "react";

/** Gold-700 line-art illustration, one-line message, optional CTA (DESIGN §6). */
export function EmptyState({
  title,
  message,
  action,
  illustration,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  illustration?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="text-gold-700" aria-hidden="true">
        {illustration ?? (
          <svg
            width="72"
            height="56"
            viewBox="0 0 72 56"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="M14 44h44l-8-26H22z" />
            <path d="M22 18l4-8h20l4 8" />
            <path d="M30 31h12" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="text-h3">{title}</p>
      {message ? <p className="text-small text-ink-2 max-w-xs">{message}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
