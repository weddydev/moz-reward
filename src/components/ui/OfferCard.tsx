import { ShopImage } from "./ShopImage";

/**
 * An offer, as the shop page shows it (PD-08; reference `.offer`): the offer's photo on top, its title in gold
 * over a short detail, on the dark ground. Two sit side by side in a row (`.m-offer-row`). The photo is
 * decorative (the title says what it is); without one the ground keeps its place so a row stays even. Used by
 * /dev/molten's phone now and by the shop page's offers (P3-05).
 */
export function OfferCard({
  imageUrl,
  title,
  detail,
  unoptimized = false,
  eager = false,
}: {
  imageUrl: string | null;
  title: string;
  detail: string;
  /** Serve the photo as it is (the /dev/molten phone, compared with the reference's own JPEGs). */
  unoptimized?: boolean;
  eager?: boolean;
}): React.JSX.Element {
  return (
    <div className="m-offer" data-testid="offer-card">
      {imageUrl ? (
        <span className="m-offer-photo">
          <ShopImage
            src={imageUrl}
            sizes="(min-width: 592px) 270px, 50vw"
            unoptimized={unoptimized}
            eager={eager}
          />
        </span>
      ) : (
        <span className="m-offer-photo" aria-hidden="true" />
      )}
      <div className="m-offer-body">
        <p className="m-offer-title">{title}</p>
        {detail ? <p className="m-offer-detail">{detail}</p> : null}
      </div>
    </div>
  );
}
