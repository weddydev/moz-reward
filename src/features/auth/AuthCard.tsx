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
}) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16"
    >
      <div className="rounded-[22px] border border-[#E8DFCE] bg-white p-6 shadow-[0_8px_24px_rgba(60,45,20,.10)] sm:p-8">
        <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
        {subtitle ? <p className="mt-2 text-[#5C564C]">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col gap-4">{children}</div>
      </div>
    </main>
  );
}

export const inputClass =
  "h-12 w-full rounded-[14px] border border-[#E8DFCE] bg-[#F4EEE2] px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A]";
export const primaryButtonClass =
  "h-12 w-full rounded-[14px] bg-[#C9A24A] font-semibold text-[#1C1A17] transition-transform active:scale-[.97] disabled:opacity-60";
export const secondaryButtonClass =
  "h-12 w-full rounded-[14px] border border-[#E8DFCE] bg-white font-semibold text-[#1C1A17] transition-transform active:scale-[.97] disabled:opacity-60";
