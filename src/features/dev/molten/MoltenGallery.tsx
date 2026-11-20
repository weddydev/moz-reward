import { LivingBackground } from "@/components/motion/LivingBackground";
import { LanguageSection } from "./LanguageSection";
import { PARITY_PARTS } from "./parity-parts";
import "./molten-page.css";

/**
 * `/dev/molten` (PD-01): the Molten reference rebuilt part by part from production components only, for the
 * parity harness (`tests/parity/`). Each part carries `data-parity="<name>"`, like its counterpart in the
 * reference copy. Until its PD task builds it, a part is a labelled placeholder (`data-parity-status="pending"`)
 * that no parity spec compares. Built so far: the living background and the Language section (PD-02).
 */
const BUILT: Record<string, () => React.JSX.Element> = {
  language: LanguageSection,
};

export function MoltenGallery(): React.JSX.Element {
  return (
    <div className="m-page">
      <LivingBackground />
      <main className="m-wrap">
        {PARITY_PARTS.map((part) => {
          const Built = BUILT[part.name];
          if (Built) return <Built key={part.name} />;
          return (
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
          );
        })}
      </main>
    </div>
  );
}
