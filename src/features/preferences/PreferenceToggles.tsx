"use client";

import { SegmentedControl, Switch } from "@/components/ui";
import { type MotionPreference, useMotionPreference, useSoundPreference } from "@/lib/preferences";
import { useHydrated } from "@/lib/use-hydrated";

const MOTION_OPTIONS: ReadonlyArray<{ value: MotionPreference; label: string }> = [
  { value: "system", label: "Device" },
  { value: "reduce", label: "Reduced" },
  { value: "full", label: "Full" },
];

/**
 * The two display preferences as controls (developer gallery now; the Me tab reuses the hooks in P1).
 * Before hydration the stored choice isn't known to React, so the controls are inert until then: a press
 * can't be lost or applied to the wrong value.
 */
export function PreferenceToggles(): React.JSX.Element {
  const hydrated = useHydrated();
  const { pref, reduced, setPref } = useMotionPreference();
  const { on, setOn } = useSoundPreference();
  return (
    <div
      className="flex max-w-sm flex-col gap-4"
      inert={!hydrated}
      data-testid="preference-toggles"
    >
      <SegmentedControl
        label="Animations"
        options={MOTION_OPTIONS}
        value={pref}
        onChange={setPref}
      />
      <p className="text-small text-ink-2" data-testid="motion-result">
        {reduced ? "Animations are reduced." : "Animations are on."}
      </p>
      <Switch
        label="Sounds"
        description="Soft chimes when gold arrives."
        checked={on}
        onCheckedChange={setOn}
      />
    </div>
  );
}
