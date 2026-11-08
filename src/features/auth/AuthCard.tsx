import type { ReactNode } from "react";

/** Temporary auth layout; restyled with design-system primitives in the P0 design tasks. */
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
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16"
    >
      <div className="border-line bg-surface shadow-2 rounded-lg border p-6 sm:p-8">
        <h1 className="text-h1">{title}</h1>
        {subtitle ? <p className="text-ink-2 mt-2">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col gap-4">{children}</div>
      </div>
    </main>
  );
}

export const inputClass =
  "h-12 w-full rounded-md border border-line bg-surface-2 px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-gold-500";
export const primaryButtonClass =
  "h-12 w-full rounded-md bg-gold-500 font-semibold text-ink transition-transform active:scale-[.97] disabled:opacity-60";
export const secondaryButtonClass =
  "h-12 w-full rounded-md border border-line bg-surface font-semibold text-ink transition-transform active:scale-[.97] disabled:opacity-60";
