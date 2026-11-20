import { PARITY_PARTS } from "./parity-parts";

/**
 * `/dev/molten` (PD-01): the Molten reference rebuilt part by part from production components only, for the
 * parity harness (`tests/parity/`). Each part carries `data-parity="<name>"`, like its counterpart in the
 * reference copy. Until its PD task builds it, a part is a labelled placeholder (`data-parity-status="pending"`)
 * that no parity spec compares.
 */
export function MoltenGallery(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl">Molten parity</h1>
        <p className="text-ink-2 max-w-prose">
          The approved Molten reference, rebuilt from production components. Parity specs compare
          each required part with the reference (<code>pnpm test:parity</code>).
        </p>
      </header>
      {PARITY_PARTS.map((part) =>
        part.status === "pending" ? (
          <section
            key={part.name}
            data-parity={part.name}
            data-parity-status="pending"
            aria-label={part.title}
            className="border-line text-ink-2 rounded-md border border-dashed p-4"
          >
            <h2 className="text-ink font-semibold">{part.title}</h2>
            <p>Pending: built in {part.task}.</p>
          </section>
        ) : null,
      )}
    </main>
  );
}
