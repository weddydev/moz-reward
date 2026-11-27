import { ChevronLeft } from "lucide-react";
import { TransitionLink } from "@/components/motion/TransitionLink";
import { ShopCoin, ShopImage } from "@/components/ui/ShopImage";
import { longestWord } from "@/lib/longest-word";

/** The customer shop page's column; its loading state uses the same one, so nothing moves when it arrives. */
export const SHOP_PAGE_CLASS =
  "mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-6 lg:max-w-[1120px] lg:px-8";

/** The cover's logo, in px (reference `.s-logo`). */
const LOGO = 60;

/** The cover photo's widths: the page column (560 px phones and tablets, 1056 px from 1024px). */
const COVER_SIZES = "(min-width: 1024px) 1056px, (min-width: 592px) 560px, 100vw";

/**
 * The shop page's cover (PD-08; reference `.cover`, `.s-logo`, `.back`): the shop's photo under a dark-to-clear
 * gradient (or the dark metal surface when it has none), the name and area line on it, the logo in a gold ring
 * in the corner and a glass back button to the Wallet. No shared-element morph: the gold wipe carries a Wallet
 * card into it (PD-08; DECISIONS "wipe replaces the morph"). The page renders the name as its `h1`; the loading state renders the same cover from the
 * tapped card (`hero-handoff`) with `loading`: no photo yet (a shimmer in its place), and the name is a hidden
 * `p`, so it isn't a second heading or announced twice. The back button works in both.
 *
 * /dev/molten's phone (PD-08) passes `onBack` (a button that plays the wipe back, instead of a link), `rise`
 * (`data-rise` 0/1/2 on the logo, name and area line, the order the reference's content rises in), `titleAs`
 * (an `h3` inside the gallery's section) and `unoptimized` (the reference's own JPEGs, compared pixel for pixel).
 */
export function ShopPageHeader({
  name,
  logoUrl,
  coverUrl = null,
  meta = null,
  loading = false,
  onBack,
  rise = false,
  titleAs = "h1",
  unoptimized = false,
}: {
  name: string;
  logoUrl: string | null;
  coverUrl?: string | null;
  /** The line under the name (category and town). */
  meta?: string | null;
  loading?: boolean;
  onBack?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Mark the parts that rise in the gold wipe: logo, name and area line (data-rise 0/1/2), or the area line only. */
  rise?: boolean | "meta";
  titleAs?: "h1" | "h3";
  unoptimized?: boolean;
}): React.JSX.Element {
  const Title = loading ? "p" : titleAs;
  const at = (k: number): { "data-rise"?: number } =>
    rise === true || (rise === "meta" && k === 2) ? { "data-rise": k } : {};
  const backIcon = <ChevronLeft aria-hidden="true" strokeWidth={2.2} />;
  return (
    <header className="m-cover" data-testid={loading ? undefined : "shop-cover"}>
      {coverUrl && !loading ? (
        <ShopImage
          src={coverUrl}
          className="m-cover-photo"
          sizes={COVER_SIZES}
          eager
          unoptimized={unoptimized}
        />
      ) : (
        <span
          className={loading ? "m-cover-photo skeleton" : "m-cover-photo"}
          data-loading={loading ? "" : undefined}
          aria-hidden="true"
        />
      )}
      {onBack ? (
        <button
          type="button"
          className="m-cover-back"
          aria-label="Back to wallet"
          data-testid="shop-back"
          onClick={onBack}
        >
          {backIcon}
        </button>
      ) : (
        <TransitionLink
          href="/wallet"
          direction="back"
          wipe="back"
          className="m-cover-back"
          aria-label="Back to wallet"
          data-testid="shop-back"
        >
          {backIcon}
        </TransitionLink>
      )}
      <div className="m-cover-text" aria-hidden={loading || undefined}>
        <Title
          className="m-cover-title"
          // The longest word's letters: the title steps down only when that word wouldn't fit (molten.css).
          style={{ "--lw": longestWord(name) } as React.CSSProperties}
          data-testid={loading ? "member-shop-name-loading" : "member-shop-name"}
          {...at(1)}
        >
          {name}
        </Title>
        {meta ? (
          <p className="m-cover-meta" {...at(2)}>
            {meta}
          </p>
        ) : null}
      </div>
      <span
        className="m-cover-logo"
        aria-hidden="true"
        data-testid={loading ? undefined : "shop-logo"}
        {...at(0)}
      >
        {logoUrl ? (
          <ShopImage src={logoUrl} size={LOGO} eager unoptimized={unoptimized} />
        ) : (
          <ShopCoin name={name} size={LOGO} />
        )}
      </span>
    </header>
  );
}
