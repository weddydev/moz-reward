import { ChevronLeft } from "lucide-react";
import { SharedElement } from "@/components/motion/SharedElement";
import { TransitionLink } from "@/components/motion/TransitionLink";
import { ShopCoin, ShopImage } from "@/components/ui/ShopImage";

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
 * in the corner and a glass back button to the Wallet. Logo and name are the shared elements a Wallet card
 * morphs into (P1-07). The page renders the name as its `h1`; the loading state renders the same cover from the
 * tapped card (`hero-handoff`) with `loading`: no photo yet (a shimmer in its place), and the name is a hidden
 * `p`, so it isn't a second heading or announced twice. The back button works in both.
 */
export function ShopPageHeader({
  shopId,
  name,
  logoUrl,
  coverUrl = null,
  meta = null,
  loading = false,
}: {
  shopId: string;
  name: string;
  logoUrl: string | null;
  coverUrl?: string | null;
  /** The line under the name (category and town). */
  meta?: string | null;
  loading?: boolean;
}): React.JSX.Element {
  const Title = loading ? "p" : "h1";
  return (
    <header className="m-cover" data-testid={loading ? undefined : "shop-cover"}>
      {coverUrl && !loading ? (
        <ShopImage src={coverUrl} className="m-cover-photo" sizes={COVER_SIZES} eager />
      ) : (
        <span
          className={loading ? "m-cover-photo skeleton" : "m-cover-photo"}
          data-loading={loading ? "" : undefined}
          aria-hidden="true"
        />
      )}
      <TransitionLink
        href="/wallet"
        direction="back"
        className="m-cover-back"
        aria-label="Back to wallet"
        data-testid="shop-back"
      >
        <ChevronLeft aria-hidden="true" strokeWidth={2.2} />
      </TransitionLink>
      <div className="m-cover-text" aria-hidden={loading || undefined}>
        <SharedElement kind="shopname" id={shopId}>
          <Title
            className="m-cover-title"
            data-testid={loading ? "member-shop-name-loading" : "member-shop-name"}
          >
            {name}
          </Title>
        </SharedElement>
        {meta ? <p className="m-cover-meta">{meta}</p> : null}
      </div>
      <SharedElement kind="shoplogo" id={shopId} fit="cover">
        <span
          className="m-cover-logo"
          aria-hidden="true"
          data-testid={loading ? undefined : "shop-logo"}
        >
          {logoUrl ? (
            <ShopImage src={logoUrl} size={LOGO} eager />
          ) : (
            <ShopCoin name={name} size={LOGO} />
          )}
        </span>
      </SharedElement>
    </header>
  );
}
