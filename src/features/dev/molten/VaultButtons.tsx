import { Button } from "@/components/ui/Button";
import { GhostArrow } from "./LabSection";

/**
 * The vault's small orbit and ghost buttons (reference `#fillBtn`, `#resetBtn`), built in PD-04 before the
 * vault itself (PD-10): their parity parts are `isolate`d, so the stand-in around them is never judged. The
 * row is the reference's whole `.v-btns` (with the molten "Add a visit") at the vault's inner width, so it
 * wraps the same way.
 */
export function VaultButtons(): React.JSX.Element {
  return (
    <section aria-label="Vault buttons (stand-in until PD-10)" className="m-v-btns">
      {/* The reference's row: its shadow falls on the row below when it wraps, so it is here too. */}
      <Button size={46} resultLabel="Pouring…">
        Add a visit (+80)
      </Button>
      <Button data-parity="orbit-button" variant="orbit" size={46}>
        Fill the vault
      </Button>
      <Button data-parity="ghost-button" variant="ghost" size={46} icon={<GhostArrow />}>
        Reset
      </Button>
    </section>
  );
}
