import { SharedElement } from "@/components/motion/SharedElement";
import { ShopLogo } from "@/features/landing/ShopLanding";

/** The customer shop page's column; its loading state uses the same one, so nothing moves when it arrives. */
export const SHOP_PAGE_CLASS =
  "mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-8 lg:max-w-3xl";

/**
 * The shop page's identity row: logo and name, the shared elements a Wallet card morphs into (P1-07). The
 * page renders it with the name as its `h1`; the loading state renders the same row from the tapped card
 * (`hero-handoff`) with `loading`, so the name isn't a second heading and isn't announced twice.
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
    <header className="flex items-center gap-4" aria-hidden={loading || undefined}>
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
