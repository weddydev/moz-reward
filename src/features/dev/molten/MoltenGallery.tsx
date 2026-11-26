import { Toaster } from "@/components/ui/Toast";
import { FxBurstLog } from "../FxBurstLog";
import { IntroSection } from "./IntroSection";
import { LabSection } from "./LabSection";
import { LanguageSection } from "./LanguageSection";
import { PARITY_PARTS } from "./parity-parts";
import { PhoneSection } from "./PhoneSection";
import "./molten-page.css";

/**
 * `/dev/molten` (PD-01): the Molten reference rebuilt part by part from production components only, for the
 * parity harness (`tests/parity/`). Each part carries `data-parity="<name>"`, like its counterpart in the
 * reference copy. Until its PD task builds it, a part is a labelled placeholder (`data-parity-status="pending"`)
 * that no parity spec compares. Built so far: the living background and the Language section (PD-02); the
 * Buttons tile, heart toggle and the toast (PD-04); the Coin switch, Liquid
 * choice and Gold seal checkbox tiles (PD-05); the Tabs, Rate your visit, Molten slider, Input and Member card tiles
 * (PD-06); the phone frame and its floating dock (PD-07); the phone's wallet stack and the gold wipe into the
 * shop (PD-08); the Gold Vault beside the phone with its demo buttons, reward card and redeem code (PD-10).
 */
const SECTIONS: readonly { parts: readonly string[]; Section: () => React.JSX.Element }[] = [
  { parts: ["intro"], Section: IntroSection },
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
  {
    parts: ["dock", "wallet-stack", "shop", "vault", "reward", "orbit-button", "ghost-button"],
    Section: PhoneSection,
  },
];

export function MoltenGallery(): React.JSX.Element {
  const rendered = new Set<string>();
  return (
    <div className="m-page">
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
      <FxBurstLog />
    </div>
  );
}
