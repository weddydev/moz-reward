import { Card } from "@/components/ui/Card";
import { frauncesItalic } from "@/styles/fonts-italic";
import { TypePlay } from "./TypePlay";

/**
 * The reference's "Language" section, rebuilt from production parts (PD-02): placed cards with the gilded edge,
 * a dark card, the Molten section type and the colour tokens. Copy is the reference's, word for word.
 */
const PRINCIPLES = [
  {
    title: "Every touch answers back",
    body: "Buttons pull toward your finger, ripple from the exact press point and spark on success. Nothing is a dead tap.",
    icon: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  },
  {
    title: "Gold is a material, not a colour",
    body: "Liquid gold pours between choices, coins roll and flip, the vault fills with a real surface wave. Light sweeps across metal.",
    icon: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z",
  },
  {
    title: "Spectacle, still fast",
    body: "One shared particle canvas, effects that scale down on slower phones, loops that sleep off-screen, and everything skippable.",
    icon: "M4 18l6-6 4 4 6-8",
    dot: true,
  },
] as const;

// The swatch notes are the reference copy (hex values shown as text), not colours used by the page.
/* eslint-disable no-restricted-syntax */
const SWATCHES: readonly {
  name: string;
  note: string;
  fill: string;
  dark?: boolean;
  edge?: string;
}[] = [
  { name: "Pearl", note: "#FFFCF5", fill: "var(--pearl)" },
  { name: "Champagne", note: "#EFDDB0", fill: "var(--champagne)" },
  { name: "Molten gold", note: "7-stop metal", fill: "var(--metal)" },
  { name: "Hot gold", note: "#FFCE4A", fill: "var(--gold-bright)" },
  { name: "Deep gold", note: "#7C5510", fill: "var(--gold-deep)", dark: true },
  { name: "Ember", note: "alerts only", fill: "var(--ember)" },
  {
    name: "Obsidian",
    note: "#15100A",
    fill: "var(--obsidian)",
    dark: true,
    edge: "rgba(255,206,74,.3)",
  },
  {
    name: "Pearl sheen",
    note: "foil only",
    fill: "linear-gradient(135deg,var(--iri-rose),var(--iri-mint),var(--iri-lilac))",
  },
];
/* eslint-enable no-restricted-syntax */

export function LanguageSection(): React.JSX.Element {
  return (
    <section data-parity="language" aria-labelledby="m-language">
      <div className="m-sec-head">
        <div>
          <p className="m-eyebrow">The direction</p>
          <h2 className={`m-sec ${frauncesItalic.variable}`} id="m-language">
            Gold that behaves like <em>molten metal</em>
          </h2>
          <p className="m-lede">
            Same white and gold the client approved, but alive. The background breathes, gold flows
            and catches the light, and every touch gets a physical answer: it pours, rolls, stamps
            or sparks.
          </p>
        </div>
      </div>
      <div className="m-lang">
        <div className="m-principles">
          {PRINCIPLES.map((p) => (
            <Card key={p.title} variant="placed" gilded lift className="m-pr">
              <span className="m-ico">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={p.icon} />
                  {"dot" in p ? <circle cx="20" cy="8" r="1.5" /> : null}
                </svg>
              </span>
              <div>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            </Card>
          ))}
        </div>
        <Card variant="dark" gilded className="m-spec">
          <div className="m-spec-bg" aria-hidden="true" />
          <div>
            <p className="m-eyebrow">Type in motion</p>
            <small>Fraunces has live weight and softness axes. Move across the word.</small>
          </div>
          <TypePlay>Collect</TypePlay>
          <div className="m-swatches">
            {SWATCHES.map((s) => (
              <div
                key={s.name}
                className={s.dark ? "m-sw dk" : "m-sw"}
                style={{ background: s.fill, ...(s.edge ? { borderColor: s.edge } : {}) }}
              >
                {s.name}
                <span>{s.note}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
