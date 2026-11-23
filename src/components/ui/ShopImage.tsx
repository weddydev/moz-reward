import Image from "next/image";
import { initialsOf } from "@/lib/initials";

/** Self-hosted photos the image optimiser may serve (next.config `images.localPatterns`): the demo shops'. */
export const OPTIMISED_PHOTO = /^\/demo\/shops\/[a-z0-9-]+\.(jpg|png|webp)$/;

/**
 * A shop's photo (cover or logo; PD-08). The demo shops' self-hosted photos go through `next/image` (AVIF/WebP at
 * the size shown, DESIGN §12); uploaded photos are already sized variants on the CDN (ARCHITECTURE §8, P2-05) and
 * load as they are. Decorative (`alt=""`): the shop is named by the text beside it. `fill` covers the positioned
 * parent (cover); otherwise `size` gives the box (logo). `unoptimized` serves the file as it is (the /dev/molten
 * phone, compared pixel for pixel with the reference's own JPEGs).
 */
export function ShopImage({
  src,
  className,
  size,
  sizes,
  eager = false,
  unoptimized = false,
}: {
  src: string;
  className?: string;
  /** Square box in px (a logo); omit to fill the parent (a cover). */
  size?: number;
  /** For a cover: the widths it is shown at (next/image `sizes`). */
  sizes?: string;
  eager?: boolean;
  unoptimized?: boolean;
}): React.JSX.Element {
  const loading = eager ? "eager" : "lazy";
  if (OPTIMISED_PHOTO.test(src)) {
    return size === undefined ? (
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes ?? "100vw"}
        loading={loading}
        unoptimized={unoptimized}
        className={className}
      />
    ) : (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        loading={loading}
        unoptimized={unoptimized}
        className={className}
      />
    );
  }
  return (
    // Uploaded photos are already sized WebP/AVIF variants on the CDN (ARCHITECTURE §8).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      {...(size === undefined ? {} : { width: size, height: size })}
      loading={loading}
      decoding="async"
      className={className}
    />
  );
}

/**
 * The fallback for a shop without a logo (DESIGN §6.4: a metal monogram coin, never bare initials on a flat
 * fill). Decorative: the shop's name is always beside it.
 */
export function ShopCoin({ name, size }: { name: string; size: number }): React.JSX.Element {
  return (
    <span
      className="m-coin"
      aria-hidden="true"
      data-testid="shop-coin"
      style={{ "--coin-size": `${String(size)}px` } as React.CSSProperties}
    >
      {initialsOf(name)}
    </span>
  );
}
