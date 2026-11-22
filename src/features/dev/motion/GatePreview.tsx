"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import { gateStorageKey } from "@/lib/motion/gilded-gate";
import { useHydrated } from "@/lib/use-hydrated";
import { Section } from "../Section";

/**
 * `/dev/motion` preview of the Gilded Gate (P1-03, DESIGN §8): it plays on a real shop landing, on a full page
 * load (its pre-paint script only runs then), once per shop per tab session; this forgets that and opens it.
 */
export function GatePreview(): React.JSX.Element {
  const [code, setCode] = useState("");
  // Typing before hydration would land in the server HTML only, leaving `code` empty and both buttons disabled
  // (iPhone CI flake, run 44689683099): the field waits for React like every other control (C-20).
  const hydrated = useHydrated();
  // Not `normaliseCode` from lib/codes: that module uses node:crypto. The landing normalises again anyway.
  const typed = code.replace(/[\s-]/g, "").toUpperCase();
  const shop = /^[A-Z0-9]{6}$/.test(typed) ? typed : null;
  const open = (src: "qr" | "nfc"): void => {
    if (!shop) return;
    try {
      sessionStorage.removeItem(gateStorageKey(shop));
    } catch {
      /* storage blocked: the gate doesn't play there anyway */
    }
    // A full page load on purpose: the gate's pre-paint script never runs on a client-side navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/s/${shop}?src=${src}`);
  };
  return (
    <Section title="Gilded Gate">
      <p className="text-small text-ink-2 max-w-prose">
        First-scan entry on a shop landing (≈ 1.4s; tap or any key skips; reduced motion = a 150ms
        fade). Enter a shop code (seeded demo shops: shop dashboard or{" "}
        <code>pnpm demo:credentials</code>) and replay it.
      </p>
      <label className="text-small flex max-w-xs flex-col gap-1 font-semibold">
        Shop code
        <input
          value={code}
          disabled={!hydrated}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          className="border-line bg-surface h-11 rounded-md border px-3 font-normal uppercase"
          autoComplete="off"
          spellCheck={false}
          data-testid="gate-preview-code"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClasses({ size: 46 })}
          disabled={!shop}
          onClick={() => {
            open("qr");
          }}
        >
          Replay as a QR scan
        </button>
        <button
          type="button"
          className={buttonClasses({ variant: "orbit", size: 46 })}
          disabled={!shop}
          onClick={() => {
            open("nfc");
          }}
        >
          Replay as an NFC tap
        </button>
      </div>
    </Section>
  );
}
