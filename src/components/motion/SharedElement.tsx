import { ViewTransition } from "react";
import { vtName } from "@/lib/motion/route-transitions";

/**
 * One entity's element that morphs into its counterpart on the next page (card image → page header). Both
 * pages wrap the matching element with the same `kind` and `id`; React names them only while a navigation
 * runs, and only when the pair exists, so a missing counterpart is a plain cross-fade. The morph runs for
 * `--dur-slow`; under reduced motion it becomes a cross-fade in place (globals.css `.morph`).
 * `fit="cover"` is for boxes whose shape differs between the two pages (an image): both snapshots fill the
 * moving box and crop. Leave it off for text, which must never be cropped.
 */
export function SharedElement({
  kind,
  id,
  fit,
  children,
}: {
  kind: string;
  id: string | number;
  fit?: "cover";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ViewTransition
      name={vtName(kind, id)}
      share={fit === "cover" ? "morph morph-cover" : "morph"}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
