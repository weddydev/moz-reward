import { SharedElement } from "@/components/motion/SharedElement";
import { CoverArt, ShopLogo } from "@/features/landing/ShopLanding";

/** The customer shop page's column; its loading state uses the same one, so nothing moves when it arrives. */
export const SHOP_PAGE_CLASS =
  "mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-6 lg:max-w-[1120px] lg:px-8";

/** The cover's box, shared by the page and its loading state (P1-09: wide cover, screen 4). */
export const SHOP_COVER_CLASS =
  "relative aspect-[16/9] w-full overflow-hidden rounded-[var(--r-lg)] lg:aspect-[4/1]";

/** The shop's cover photo, or the quiet foil surface when it has none (as on the landing page). */
export function ShopCover({ coverUrl }: { coverUrl: string | null }): React.JSX.Element {
  return (
    <div className={SHOP_COVER_CLASS} data-testid="shop-cover">
      <CoverArt coverUrl={coverUrl} />
    </div>
  );
}

/**
 * The shop page's identity row: logo and name, the shared elements a Wallet card morphs into (P1-07). The logo
 * overlaps the cover's lower edge. The page renders it with the name as its `h1`; the loading state renders
 * the same row from the tapped card (`hero-handoff`) with `loading`, so the name isn't a second heading and
 * isn't announced twice.
 */
export function ShopPageHeader({
  shopId,
  name,
  logoUrl,
  loading = false,
}: {
  shopId: string;
  name: string;
  logoUrl: string | null;
  loading?: boolean;
}): React.JSX.Element {
  const Title = loading ? "p" : "h1";
  return (
    <header
      className="relative -mt-10 flex items-end gap-4 px-4 lg:px-6"
      aria-hidden={loading || undefined}
    >
      <SharedElement kind="shoplogo" id={shopId} fit="cover">
        <ShopLogo name={name} logoUrl={logoUrl} />
      </SharedElement>
      <SharedElement kind="shopname" id={shopId}>
        <Title
          className="text-h1 min-w-0 break-words"
          data-testid={loading ? "member-shop-name-loading" : "member-shop-name"}
        >
          {name}
        </Title>
      </SharedElement>
    </header>
  );
}
