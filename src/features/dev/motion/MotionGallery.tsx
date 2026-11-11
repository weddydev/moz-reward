import { SharedElement, TransitionLink } from "@/components/motion";
import { Section } from "../Section";
import { DEMO_SHOPS, DEMO_TABS } from "./demo-data";
import { ShopThumb } from "./ShopThumb";

/**
 * `/dev/motion` (P0-10): route transitions and the motion primitives, each in a labelled block. Open a card
 * (forward + morph), come back (back), or walk the tabs (direction from tab order). Reduced motion (system
 * or the toggle on `/dev/ui`) turns all of it into short fades.
 */
export function MotionGallery(): React.JSX.Element {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-5 py-10">
      <p className="text-small text-gold-700 font-semibold">Dev only</p>
      <h1 className="text-display">Motion gallery</h1>
      <p className="text-ink-2 mt-2 max-w-prose">
        Page transitions and motion primitives (DESIGN.md §7). Navigation never waits for an
        animation; with reduced motion everything becomes a short fade.
      </p>

      <Section title="Card to page">
        <p className="text-small text-ink-2 max-w-prose">
          Forward: the page slides 8px left and the card&apos;s image and name morph into the page
          header. The back link reverses the direction.
        </p>
        <ul className="grid gap-3 sm:grid-cols-3" data-demo="cards">
          {DEMO_SHOPS.map((shop) => (
            <li key={shop.id}>
              <TransitionLink
                href={`/dev/motion/shop/${shop.id}`}
                direction="forward"
                className="pressable bg-surface shadow-1 flex items-center gap-3 rounded-md p-3"
              >
                <SharedElement kind="shopimage" id={shop.id}>
                  <div data-shared="image">
                    <ShopThumb />
                  </div>
                </SharedElement>
                <SharedElement kind="shoptitle" id={shop.id}>
                  <span className="text-h3" data-shared="title">
                    {shop.name}
                  </span>
                </SharedElement>
              </TransitionLink>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tab order">
        <p className="text-small text-ink-2 max-w-prose">
          Switching to a later tab slides the content 6px from the right, an earlier tab from the
          left; the tab bar stays still.
        </p>
        <div className="flex flex-wrap gap-3">
          {DEMO_TABS.map((t) => (
            <TransitionLink
              key={t.slug}
              href={`/dev/motion/tabs/${t.slug}`}
              direction="forward"
              className="pressable bg-surface border-line text-small rounded-pill hit-44 border px-4 py-2 font-semibold"
            >
              {t.label}
            </TransitionLink>
          ))}
        </div>
      </Section>
    </main>
  );
}
