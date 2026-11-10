import type { ReactNode } from "react";

/** One titled block of a developer gallery page. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  const id = `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="border-line flex flex-col gap-4 border-t py-8" aria-labelledby={id}>
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}
