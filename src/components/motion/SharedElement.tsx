import { ViewTransition } from "react";
import { vtName } from "@/lib/motion/route-transitions";

/**
 * One entity's element that morphs into its counterpart on the next page (card image → page header). Both
 * pages wrap the matching element with the same `kind` and `id`; React names them only while a navigation
 * runs, and only when the pair exists, so a missing counterpart is a plain cross-fade. The morph runs for
 * `--dur-slow`; under reduced motion it becomes a cross-fade in place (globals.css `.morph`).
 */
export function SharedElement({
  kind,
  id,
  children,
}: {
  kind: string;
  id: string | number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ViewTransition name={vtName(kind, id)} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
