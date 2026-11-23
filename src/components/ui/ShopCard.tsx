import { ShopCoin, ShopImage } from "./ShopImage";
import type { ReactNode } from "react";

/** Widths a wallet card is shown at: full width on phones, two columns from 768px, three from 1280px. */
export const WALLET_CARD_SIZES = "(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw";

/**
 * The wallet card (PD-08, DESIGN §6.4; reference `.wcard`): the shop's cover photo under a dark shade, its logo
 * in a gold ring (or the metal coin), the name (one line, ellipsis) over the address, the gold count, a gold
 * progress bar and the progress label with the badges beside it (PRODUCT §4). A shine sweeps across every 5 s
 * (staggered 0.5 s down a stack by its slot's `--i`). The card's outer element is the caller's (`as`: a link in the
 * Wallet, a button on /dev/molten), so the stack's sibling rules see the cards. `dimmed` greys a suspended or closed
 * shop (its badge says which).
 */
export function ShopCard({
  name,
  address,
  logoUrl,
  coverUrl,
  gold,
  progress,
  progressLabel,
  progressName,
  badges,
  dimmed = false,
  unoptimized = false,
  eager = false,
  render,
}: {
  name: string;
  address?: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  /** The gold count in the corner ("720"); omitted for a shop without a programme. */
  gold?: string | null;
  /** 0–1 */
  progress: number;
  progressLabel: string;
  /** The progress bar's accessible name; defaults to "<name> progress". */
  progressName?: string;
  badges?: ReactNode;
  dimmed?: boolean;
  unoptimized?: boolean;
  /** Load the photos at once (cards in the first screenful). */
  eager?: boolean;
  /** Renders the card element with the given class, data and children (a link or a button). */
  render: (card: {
    className: string;
    "data-dimmed"?: "";
    children: ReactNode;
  }) => React.JSX.Element;
}): React.JSX.Element {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const logo = (
    <span className="m-wc-logo">
      {logoUrl ? (
        <ShopImage src={logoUrl} size={36} unoptimized={unoptimized} eager={eager} />
      ) : (
        <ShopCoin name={name} size={36} />
      )}
    </span>
  );
  const title = <span className="m-wc-name block">{name}</span>;
  return render({
    className: "m-wcard",
    ...(dimmed ? { "data-dimmed": "" as const } : {}),
    children: (
      <>
        {coverUrl ? (
          <ShopImage
            src={coverUrl}
            sizes={WALLET_CARD_SIZES}
            unoptimized={unoptimized}
            eager={eager}
            className="m-wc-photo"
          />
        ) : (
          <span className="m-photo-fallback" aria-hidden="true" />
        )}
        <span className="m-wc-shade" aria-hidden="true" />
        <span className="m-wc-top">
          {logo}
          <span className="m-wc-id">
            {title}
            {address ? <span className="m-wc-addr">{address}</span> : null}
          </span>
          {gold ? <span className="m-wc-gold">{gold}</span> : null}
        </span>
        <span className="m-wc-foot block">
          <span
            className="m-wc-bar block"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={progressName ?? `${name} progress`}
          >
            <i style={{ "--p": `${String(pct)}%` } as React.CSSProperties} />
          </span>
          <span className="m-wc-metarow">
            <span className="m-wc-meta">{progressLabel}</span>
            {badges ? <span className="flex shrink-0 flex-wrap gap-1">{badges}</span> : null}
          </span>
        </span>
      </>
    ),
  });
}
