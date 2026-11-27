import { CoverPhoto } from "@/components/ui/CoverPhoto";

/** The cover photo's widths: the page column (560 px phones and tablets, half of the 1280 px row from 1024px). */
const COVER_SIZES = "(min-width: 1024px) 580px, (min-width: 592px) 560px, 100vw";

/**
 * The cover's picture (PD-11, the shop page's cover language): the uploaded photo, or the dark photo ground when
 * there is none (or it can't load), under the dark-to-clear shade and the gold glow. Also drawn inside the Gilded
 * Gate (P1-03) for its morph, without test ids or the high fetch priority (`page` false); the same `sizes`, so
 * the clone and the page pick the same file.
 */
export function CoverArt({
  coverUrl,
  page = false,
}: {
  coverUrl: string | null;
  page?: boolean;
}): React.JSX.Element {
  return (
    <>
      {coverUrl ? (
        <CoverPhoto
          src={coverUrl}
          className="m-art-photo"
          sizes={COVER_SIZES}
          eager
          priority={page}
          {...(page ? { testId: "landing-cover" } : {})}
        />
      ) : (
        <span
          className="m-art-ground"
          aria-hidden="true"
          {...(page ? { "data-testid": "landing-cover-fallback" } : {})}
        />
      )}
      <span className="m-art-shade" aria-hidden="true" />
    </>
  );
}
