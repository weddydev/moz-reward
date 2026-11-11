import type { GalleryPrimitive } from "./gallery-list";
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

/**
 * One primitive's block inside a section (P0-09 AC 1): `data-primitive` is what the E2E looks for, and the
 * name is typed against the gallery list so a typo fails the build.
 */
export function Demo({
  name,
  note,
  children,
}: {
  name: GalleryPrimitive;
  note?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div data-primitive={name} className="flex min-w-0 flex-col gap-3">
      <h3 className="text-h3 font-mono">{name}</h3>
      {note ? <p className="text-small text-ink-2 max-w-prose">{note}</p> : null}
      {children}
    </div>
  );
}

/** One labelled cell of a state matrix. */
export function State({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <span className="text-caption text-ink-2">{label}</span>
      {children}
    </div>
  );
}
