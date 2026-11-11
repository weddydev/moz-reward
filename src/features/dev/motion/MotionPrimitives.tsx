"use client";

import { useState } from "react";
import { Popover } from "@/components/motion";
import { BottomSheet, Button, Card, Modal, SidePanel, Switch, toast } from "@/components/ui";
import { haptic, HAPTICS, type HapticName } from "@/lib/haptics";
import { MOTION_PRESETS, staggerStyle } from "@/lib/motion/presets";
import { useSoundPreference } from "@/lib/preferences";
import { play, SOUNDS, type SoundName } from "@/lib/sound";
import { useHydrated } from "@/lib/use-hydrated";
import { Section } from "../Section";

const chip =
  "pressable bg-surface border-line text-small rounded-pill hit-44 inline-flex border px-4 py-2 font-semibold";

/** The overlay, toast and press presets as named in `MOTION_PRESETS`, each with a way to play it. */
function PresetDemos(): React.JSX.Element {
  const hydrated = useHydrated();
  const [open, setOpen] = useState<"modal" | "panel" | "sheet" | null>(null);
  const close = () => {
    setOpen(null);
  };
  const rows = Object.entries(MOTION_PRESETS);
  return (
    <Section title="Presets">
      <p className="text-small text-ink-2 max-w-prose">
        Named in <code>src/lib/motion/presets.ts</code>; the CSS lives once in globals.css.
        Transform and opacity only, everyday motion under 300ms, exits faster than entrances.
      </p>
      <div className="flex flex-wrap gap-3" data-demo="presets">
        {(["modal", "panel", "sheet"] as const).map((kind) => (
          <Button
            key={kind}
            variant="secondary"
            disabled={!hydrated}
            data-preset={kind}
            onClick={() => {
              setOpen(kind);
            }}
          >
            {`Open ${kind}`}
          </Button>
        ))}
        <Button
          variant="secondary"
          disabled={!hydrated}
          data-preset="toast"
          onClick={() => {
            toast("Saved. Toasts slide up 12px and fade.");
          }}
        >
          Show a toast
        </Button>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Preset list">
        <table className="text-small w-full min-w-[560px] text-left">
          <thead className="text-ink-2">
            <tr>
              <th className="py-2 pr-4 font-semibold">Preset</th>
              <th className="py-2 pr-4 font-semibold">Selector</th>
              <th className="py-2 pr-4 font-semibold">Motion</th>
              <th className="py-2 font-semibold">Enter / exit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, p]) => (
              <tr key={name} className="border-line border-t">
                <td className="py-2 pr-4 font-mono">{name}</td>
                <td className="py-2 pr-4 font-mono">{p.selector}</td>
                <td className="py-2 pr-4">{p.motion}</td>
                <td className="py-2 font-mono">{`${p.enter} / ${p.exit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open === "modal"} onClose={close} title="Modal preset">
        <p>Centred; scales from .96 with a fade. Modals are not anchored, so they stay centred.</p>
      </Modal>
      <SidePanel open={open === "panel"} onClose={close} title="Side panel preset">
        <p>Slides its own width in from the right.</p>
      </SidePanel>
      <BottomSheet open={open === "sheet"} onClose={close} title="Bottom sheet preset">
        <p>Rises its own height. Drag the handle down, or flick it, to close.</p>
      </BottomSheet>
    </Section>
  );
}

function PopoverDemos(): React.JSX.Element {
  const body = (
    <div className="flex w-56 flex-col gap-2">
      <p className="text-small text-ink-2">It grows from the button that opened it.</p>
      <Button variant="secondary" size={40}>
        An action inside
      </Button>
    </div>
  );
  return (
    <Section title="Popover">
      <p className="text-small text-ink-2 max-w-prose">
        Scales from .95 with a fade, from its trigger (never from nothing), in 220ms. Close it and
        reopen it quickly: it reverses from where it is. The last one sits at the edge, so it shifts
        inside the screen and still grows from its button.
      </p>
      <div className="flex flex-wrap items-center gap-3" data-demo="popover">
        <Popover label="Open popover" title="Popover demo" triggerClassName={chip}>
          {body}
        </Popover>
        <span className="ml-auto">
          <Popover label="At the edge" title="Popover at the edge" triggerClassName={chip}>
            {body}
          </Popover>
        </span>
      </div>
    </Section>
  );
}

const SIZES = [0, 1, 8, 50] as const;

function StaggerDemo(): React.JSX.Element {
  const [count, setCount] = useState<(typeof SIZES)[number]>(8);
  const [run, setRun] = useState(0);
  const [clicked, setClicked] = useState<number | null>(null);
  return (
    <Section title="Stagger">
      <p className="text-small text-ink-2 max-w-prose">
        Items enter 50ms apart (30–80ms allowed); after the 8th they all share its delay, so a long
        list is never slow. Every item can be read and tapped from the first frame.
      </p>
      <div className="flex flex-wrap gap-3">
        {SIZES.map((n) => (
          <button
            key={n}
            type="button"
            className={chip}
            aria-pressed={count === n}
            onClick={() => {
              setCount(n);
              setClicked(null);
              setRun((r) => r + 1);
            }}
          >
            {n === 1 ? "1 item" : `${String(n)} items`}
          </button>
        ))}
      </div>
      <p className="text-small text-ink-2" aria-live="polite" data-testid="stagger-clicked">
        {clicked === null ? "Nothing tapped yet" : `Tapped item ${String(clicked + 1)}`}
      </p>
      {count === 0 ? (
        <p className="text-small text-ink-2" data-demo="stagger-empty">
          No items.
        </p>
      ) : (
        <ul key={run} className="grid gap-2 sm:grid-cols-2" data-demo="stagger">
          {Array.from({ length: count }, (_, i) => (
            <li key={i} className="stagger-item" style={staggerStyle(i)}>
              <button
                type="button"
                className="pressable bg-surface shadow-1 text-small hit-44 w-full rounded-md px-4 py-3 text-left"
                onClick={() => {
                  setClicked(i);
                }}
              >
                {`Item ${String(i + 1)}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PressHoverDemos(): React.JSX.Element {
  const [on, setOn] = useState(false);
  return (
    <Section title="Press and hover">
      <ul className="text-small text-ink-2 max-w-prose list-disc space-y-1 pl-5">
        <li>
          <code>.pressable</code>: the whole control scales to .97 on press (a dim under reduced
          motion) and springs back in 120ms.
        </li>
        <li>
          <code>data-press</code>: only the visible part scales when its larger hit area is pressed
          (the switch track).
        </li>
        <li>
          <code>hover:</code> classes apply only where a real pointer hovers, so a tap never leaves
          a hover style behind.
        </li>
        <li>The primary button&apos;s gold sheen shifts on desktop hover.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-4" data-demo="press">
        <Button>Primary</Button>
        <Button variant="secondary">Pressable</Button>
        <div className="w-64">
          <Switch checked={on} onCheckedChange={setOn} label="Switch (data-press)" />
        </div>
        <Card className="hover:bg-surface-2 duration-fast w-48 p-4 transition-colors">
          <p className="text-small">Hover me with a mouse</p>
        </Card>
      </div>
    </Section>
  );
}

/** P0-11: every sound and haptic pattern, with the toggle they obey and what happened on the last press. */
function SoundHapticDemos(): React.JSX.Element {
  const hydrated = useHydrated();
  const { on, setOn } = useSoundPreference();
  const [last, setLast] = useState("Nothing played yet.");
  return (
    <Section title="Sound and haptics">
      <p className="text-small text-ink-2 max-w-prose">
        Sounds are synthesised in the browser (no audio files) and unlock on your first tap. Haptics
        work on Android only; iPhone has no vibration for web pages. Both follow the toggle below.
      </p>
      <div className="w-64">
        <Switch checked={on} onCheckedChange={setOn} label="Sounds and haptics" />
      </div>
      <div className="flex flex-wrap gap-3" data-demo="sounds">
        {(Object.keys(SOUNDS) as SoundName[]).map((name) => (
          <Button
            key={name}
            variant="secondary"
            disabled={!hydrated}
            onClick={() => {
              setLast(
                play(name) ? `Played the ${name} sound.` : `The ${name} sound stayed silent.`,
              );
            }}
          >
            {`Play ${name}`}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3" data-demo="haptics">
        {(Object.keys(HAPTICS) as HapticName[]).map((name) => (
          <Button
            key={name}
            variant="secondary"
            disabled={!hydrated}
            onClick={() => {
              setLast(
                haptic(name)
                  ? `Vibrated: ${name}.`
                  : `No vibration for ${name} (off, or not supported on this device).`,
              );
            }}
          >
            {`Vibrate: ${name}`}
          </Button>
        ))}
      </div>
      <p className="text-small text-ink-2" role="status" data-testid="sound-status">
        {last}
      </p>
    </Section>
  );
}

/** `/dev/motion` (P0-10 step B, P0-11): the motion presets and helpers, each in a labelled section. */
export function MotionPrimitives(): React.JSX.Element {
  return (
    <>
      <PresetDemos />
      <PopoverDemos />
      <StaggerDemo />
      <PressHoverDemos />
      <SoundHapticDemos />
    </>
  );
}
