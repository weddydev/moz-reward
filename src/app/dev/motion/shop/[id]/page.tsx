import { notFound } from "next/navigation";
import { SharedElement, TransitionLink } from "@/components/motion";
import { demoShop } from "@/features/dev/motion/demo-data";
import { ShopThumb } from "@/features/dev/motion/ShopThumb";
import { TapCounter } from "@/features/dev/motion/TapCounter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Motion demo: shop",
  robots: { index: false, follow: false },
};

export default async function MotionShopPage({
  params,
}: PageProps<"/dev/motion/shop/[id]">): Promise<React.JSX.Element> {
  const { id } = await params;
  const shop = demoShop(id);
  if (!shop) notFound();
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-10">
      <TransitionLink
        href="/dev/motion"
        direction="back"
        className="text-small text-ink-2 font-semibold underline"
      >
        ← Motion gallery
      </TransitionLink>
      <SharedElement kind="shopimage" id={shop.id} fit="cover">
        <div data-shared="image">
          <ShopThumb large />
        </div>
      </SharedElement>
      <SharedElement kind="shoptitle" id={shop.id}>
        <h1 className="text-h1 self-start" data-shared="title">
          {shop.name}
        </h1>
      </SharedElement>
      <p className="text-ink-2">{shop.area}</p>
      <TapCounter />
    </main>
  );
}
