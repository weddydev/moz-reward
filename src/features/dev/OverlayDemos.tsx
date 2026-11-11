"use client";

import { useState } from "react";
import { BottomSheet, Button, Chip, ChipGroup, Modal, SidePanel, TextField } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";

type Demo = "modal" | "stacked" | "tall" | "text" | "panel" | "sheet" | "sheet-long";

const LINES = Array.from(
  { length: 24 },
  (_, i) => `Visit ${String(i + 1)} · 7 Nov 2026 · +10 gold`,
);
const LONG_TITLE =
  "Brew & Bloom Café — Free coffee & cake reward for members who visited ten times this autumn";

/** Gallery demos for Modal, SidePanel and BottomSheet (P0-09 step C; the full state matrix is step D). */
export function OverlayDemos(): React.JSX.Element {
  const hydrated = useHydrated();
  const [open, setOpen] = useState<Demo | null>(null);
  const [inner, setInner] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const close = () => {
    setOpen(null);
  };
  const trigger = (demo: Demo, label: string) => (
    <Button
      variant="secondary"
      disabled={!hydrated}
      data-overlay-trigger={demo}
      onClick={() => {
        setOpen(demo);
      }}
    >
      {label}
    </Button>
  );

  const innerModal = (
    <Modal
      open={inner}
      onClose={() => {
        setInner(false);
      }}
      title="Are you sure?"
      description="This one sits on top. Esc closes only this one."
      footer={
        <Button
          onClick={() => {
            setInner(false);
          }}
        >
          OK
        </Button>
      }
    />
  );
  const openInner = (
    <Button
      variant="secondary"
      onClick={() => {
        setInner(true);
      }}
    >
      Open another on top
    </Button>
  );

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {trigger("modal", "Modal")}
        {trigger("stacked", "Modal + stacked")}
        {trigger("tall", "Tall modal")}
        {trigger("text", "Text-only modal")}
        {trigger("panel", "Side panel")}
        {trigger("sheet", "Bottom sheet")}
        {trigger("sheet-long", "Long bottom sheet")}
      </div>

      <Modal
        open={open === "modal" || open === "stacked"}
        onClose={close}
        title="Edit reward"
        description="Members see the change straight away."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={close}>Save</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Reward name" defaultValue="Free coffee & cake" />
          {open === "stacked" && openInner}
        </div>
      </Modal>

      <Modal open={open === "tall"} onClose={close} title={LONG_TITLE}>
        <ul className="text-small text-ink-2 flex flex-col gap-3">
          {LINES.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={open === "text"}
        onClose={close}
        title="Points added"
        description="Text only: the dialog itself takes focus."
      >
        <p className="text-ink-2">+80 gold at Brew & Bloom Café on 7 Nov 2026, 5pm.</p>
      </Modal>

      <SidePanel
        open={open === "panel"}
        onClose={close}
        title="Approve request"
        description="Aisha Khan · K7Q-42M · 7 Nov 2026, 14:05"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Decline
            </Button>
            <Button onClick={close}>Approve 80 gold</Button>
          </>
        }
      >
        <ul className="text-small text-ink-2 flex flex-col gap-3">
          {LINES.slice(0, 12).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </SidePanel>

      <BottomSheet
        open={open === "sheet"}
        onClose={close}
        title="Redeem reward"
        description="Show this to the staff at the counter."
        footer={
          <Button className="w-full" onClick={close}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <ChipGroup label="What did you have?">
            {["Coffee", "Cake", "Tea", "Toastie"].map((c) => (
              <Chip
                key={c}
                selected={picked.includes(c)}
                onToggle={() => {
                  setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
                }}
              >
                {c}
              </Chip>
            ))}
          </ChipGroup>
          {openInner}
        </div>
      </BottomSheet>

      <BottomSheet
        open={open === "sheet-long"}
        onClose={close}
        title="Visit history"
        description="Scroll the list; drag the handle to close."
      >
        <ul className="text-small text-ink-2 flex flex-col gap-3" data-testid="sheet-long-list">
          {LINES.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </BottomSheet>

      {innerModal}
    </>
  );
}
