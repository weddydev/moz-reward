import { LivingBackground } from "@/components/motion/LivingBackground";
import { Toaster } from "@/components/ui/Toast";
import { LabSection } from "./LabSection";
import { LanguageSection } from "./LanguageSection";
import { PARITY_PARTS } from "./parity-parts";
import { VaultButtons } from "./VaultButtons";
import "./molten-page.css";

/**
 * `/dev/molten` (PD-01): the Molten reference rebuilt part by part from production components only, for the
 * parity harness (`tests/parity/`). Each part carries `data-parity="<name>"`, like its counterpart in the
 * reference copy. Until its PD task builds it, a part is a labelled placeholder (`data-parity-status="pending"`)
 * that no parity spec compares. Built so far: the living background and the Language section (PD-02); the
 * Buttons tile, heart toggle, the vault's orbit and ghost buttons and the toast (PD-04); the Coin switch, Liquid
 * choice and Gold seal checkbox tiles (PD-05); the Tabs, Rate your visit, Molten slider, Input and Member card tiles
 * (PD-06).
 */
const SECTIONS: readonly { parts: readonly string[]; Section: () => React.JSX.Element }[] = [
  { parts: ["language"], Section: LanguageSection },
  {
    parts: [
      "tile",
      "molten-button",
      "heart-toggle",
      "coin-switch-tile",
      "coin-switch",
      "liquid-choice-tile",
      "liquid-choice",
      "seal-checkbox-tile",
      "seal-checkbox",
      "seal-checkbox-on",
      "tabs-tile",
      "tabs",
      "stars-tile",
      "stars",
      "slider-tile",
      "slider",
      "text-field-tile",
      "text-field",
      "member-card-tile",
      "member-card",
    ],
    Section: LabSection,
  },
  { parts: ["orbit-button", "ghost-button"], Section: VaultButtons },
];

export function MoltenGallery(): React.JSX.Element {
  const rendered = new Set<string>();
  return (
    <div className="m-page">
      <LivingBackground />
      <main className="m-wrap">
        {PARITY_PARTS.map((part) => {
          if (part.name === "toast") return null; // the Toaster below
          const section = SECTIONS.find((s) => s.parts.includes(part.name));
          if (section) {
            if (rendered.has(section.parts[0] ?? "")) return null;
            rendered.add(section.parts[0] ?? "");
            return <section.Section key={part.name} />;
          }
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
      <Toaster parity="toast" />
    </div>
  );
}
