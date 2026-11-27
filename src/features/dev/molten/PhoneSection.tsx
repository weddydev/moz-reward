"use client";

import { useRef, useState } from "react";
import { usePauseOffscreen } from "@/components/motion/usePauseOffscreen";
import { Button } from "@/components/ui/Button";
import { Dock, DOCK_ITEM, DOCK_SCAN, scanPress } from "@/components/ui/Dock";
import { DockMarket, DockMe, DockOffers, DockScan, DockWallet } from "@/components/ui/dock-icons";
import { MiniVault } from "@/components/ui/MiniVault";
import { OfferCard } from "@/components/ui/OfferCard";
import { ShopCard } from "@/components/ui/ShopCard";
import { ShopImage } from "@/components/ui/ShopImage";
import { toast } from "@/components/ui/Toast";
import { ShopPageHeader } from "@/features/shop/ShopPageHeader";
import { anim } from "@/lib/motion/anim";
import { burst } from "@/lib/motion/fx";
import { circleClip, riseDelay, WIPE, wipePoint, wipeRadius } from "@/lib/motion/wipe";
import { frauncesItalic } from "@/styles/fonts-italic";
import { VaultSection } from "./VaultSection";

const ITEMS = [
  { label: "Wallet", Glyph: DockWallet },
  { label: "Offers", Glyph: DockOffers },
  { label: "Market", Glyph: DockMarket },
  { label: "Me", Glyph: DockMe },
] as const;

const photo = (file: string): string => `/demo/shops/${file}.jpg`;

/** The reference's three shops (its `SHOPS`), in stack order. */
const SHOPS = [
  {
    id: "bake",
    name: "Camden Bakehouse",
    meta: "Chalk Farm Rd · open till 6pm",
    gold: 360,
    target: 600,
    reward: "Free pastry",
    offers: [
      ["bake-offer1", "Sourdough", "Half price after 4pm"],
      ["bake-offer2", "+30 gold", "Any box of cupcakes"],
    ],
  },
  {
    id: "pedal",
    name: "Pedal & Co.",
    meta: "Kentish Town · open till 7pm",
    gold: 1400,
    target: 2000,
    reward: "Free service",
    offers: [
      ["pedal-offer1", "Free check", "With any service"],
      ["pedal-offer2", "10% off", "Commuter bikes"],
    ],
  },
  {
    id: "brew",
    name: "Brew & Bloom Café",
    meta: "Camden High St · open till 8pm",
    gold: 720,
    target: 1000,
    reward: "Free coffee & cake",
    offers: [
      ["brew-offer1", "2-for-1", "Flat whites until 5pm"],
      ["brew-offer2", "+40 gold", "Weekday brunch"],
    ],
  },
] as const;

type Shop = (typeof SHOPS)[number];

const n = (v: number): string => v.toLocaleString("en-GB");
const share = (s: Shop): number => s.gold / s.target;

/**
 * The reference's "Phone" section (`#phone`) on `/dev/molten`: the phone frame with its status bar, the Wallet
 * view (greeting, bell, total, the stack of three wallet cards, today's drops) and the floating dock (PD-07).
 * Tapping a card plays the gold wipe into that shop exactly as the reference script does (values from
 * `WIPE`): the metal circle grows from the tap, the shop follows in the same circle 110 ms later, the wallet
 * sinks, sparks fly, the shop's content rises and its gold bar fills; the back button closes the circle onto
 * itself while the wallet comes back. Like the reference, the views are shown and hidden by hand and the
 * animations start in the click's own task (the parity harness pauses them right after the event); the shop's
 * content is re-rendered for the tapped card in place (same elements), so the animations hold.
 * The Gold Vault (`VaultSection`, PD-10) fills the phone's neighbour column.
 */
export function PhoneSection(): React.JSX.Element {
  const [current, setCurrent] = useState(0);
  const [shop, setShop] = useState<Shop>(SHOPS[2]);
  const screen = useRef<HTMLDivElement>(null);
  const wallet = useRef<HTMLDivElement>(null);
  const wipe = useRef<HTMLDivElement>(null);
  const shopView = useRef<HTMLDivElement>(null);
  const open = useRef(false);
  usePauseOffscreen(screen);
  // Columns: Wallet, Offers, Scan, Market, Me; the gold sits on the four items, never on Scan.
  const column = current < 2 ? current : current + 1;

  const enter = (next: Shop, e: React.MouseEvent<HTMLButtonElement>): void => {
    const [s, w, v, c] = [screen.current, wipe.current, shopView.current, wallet.current];
    if (open.current || !s || !w || !v || !c) return;
    open.current = true;
    setShop(next);
    const stage = s.getBoundingClientRect();
    const { x, y } = wipePoint(e, e.currentTarget.getBoundingClientRect(), stage);
    for (const a of w.getAnimations()) a.cancel();
    for (const a of v.getAnimations({ subtree: true })) a.cancel();
    w.hidden = false;
    v.hidden = false;
    const r = wipeRadius(s.clientWidth, s.clientHeight);
    const circle = [{ clipPath: circleClip(0, x, y) }, { clipPath: circleClip(r, x, y) }];
    anim(w, circle, { duration: WIPE.durationMs, easing: WIPE.easing });
    const grow = anim(v, circle, {
      duration: WIPE.durationMs,
      delay: WIPE.shopDelayMs,
      easing: WIPE.easing,
    });
    const done = (): void => {
      w.hidden = true;
    };
    if (grow) grow.onfinish = done;
    else done();
    anim(
      c,
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: `scale(${String(WIPE.walletScale)})`, opacity: WIPE.walletOpacity },
      ],
      { duration: WIPE.walletMs },
    );
    anim(
      v.querySelector("[data-wipe-bar]"),
      [{ transform: "scaleX(0)" }, { transform: `scaleX(${String(share(next))})` }],
      { duration: WIPE.bar.ms, delay: WIPE.bar.delayMs },
    );
    for (const el of v.querySelectorAll<HTMLElement>("[data-rise]")) {
      anim(
        el,
        [
          { opacity: 0, transform: `translateY(${String(WIPE.rise.fromPx)}px)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: WIPE.rise.ms, delay: riseDelay(Number(el.dataset.rise)) },
      );
    }
    setTimeout(() => {
      burst(stage.left + x, stage.top + y, {
        type: "spark",
        count: WIPE.sparks.count,
        speed: WIPE.sparks.speed,
      });
    }, WIPE.sparks.delayMs);
  };

  const leave = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const [s, v, c] = [screen.current, shopView.current, wallet.current];
    if (!s || !v || !c) return;
    const { x, y } = wipePoint(
      e,
      e.currentTarget.getBoundingClientRect(),
      s.getBoundingClientRect(),
    );
    const r = wipeRadius(s.clientWidth, s.clientHeight);
    const close = anim(v, [{ clipPath: circleClip(r, x, y) }, { clipPath: circleClip(0, x, y) }], {
      duration: WIPE.back.ms,
      easing: WIPE.easing,
    });
    anim(
      c,
      [
        { transform: `scale(${String(WIPE.walletScale)})`, opacity: WIPE.walletOpacity },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: WIPE.back.ms, delay: WIPE.back.walletDelayMs },
    );
    const done = (): void => {
      v.hidden = true;
      close?.cancel();
      for (const a of c.getAnimations()) a.cancel();
      open.current = false;
    };
    if (close) close.onfinish = done;
    else done();
  };

  return (
    <section aria-labelledby="m-phone">
      <div className="m-sec-head">
        <div>
          <p className="m-eyebrow">New structure</p>
          <h2 className={`m-sec ${frauncesItalic.variable}`} id="m-phone">
            A wallet that feels like <em>a real wallet</em>
          </h2>
          <p className="m-lede">
            Shop cards stack like cards in a wallet and fan out. Tapping one pours gold across the
            screen into the shop. The nav becomes a floating dock with a liquid indicator and a live
            Scan button.
          </p>
        </div>
      </div>
      <div className="m-duo">
        <div className="m-phone">
          <div className="m-screen" ref={screen}>
            <div className="m-status" aria-hidden="true">
              <span>17:42</span>
              <span>5G ▮▮▮</span>
            </div>
            <div className="m-view m-view-wallet" ref={wallet}>
              <div className="m-w-head">
                <div>
                  <p className="m-hi">Good evening</p>
                  <p className="m-wname">Aisha</p>
                </div>
                <button type="button" className="m-bell" aria-label="Notifications, 2 new">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <i aria-hidden="true">2</i>
                </button>
              </div>
              <p className="m-total">
                <span className="m-t-num">2,480</span>
                <span className="m-t-lbl">gold across 3 shops</span>
              </p>
              <ul className="m-stack" data-layout="stack" data-parity="wallet-stack">
                {SHOPS.map((s, i) => (
                  <li key={s.id} className="m-wslot" style={{ "--i": i } as React.CSSProperties}>
                    <ShopCard
                      name={s.name}
                      logoUrl={photo(`${s.id}-logo`)}
                      coverUrl={photo(`${s.id}-cover`)}
                      gold={n(s.gold)}
                      progress={share(s)}
                      progressLabel={`${n(s.gold)} / ${n(s.target)} · ${s.reward}`}
                      unoptimized
                      eager
                      render={({ className, children, ...data }) => (
                        <button
                          type="button"
                          className={`${className} w-full`}
                          {...data}
                          data-id={s.id}
                          onClick={(e) => {
                            enter(s, e);
                          }}
                        >
                          {children}
                        </button>
                      )}
                    />
                  </li>
                ))}
              </ul>
              <div className="m-drops">
                <span className="m-drop-chip">
                  <ShopImage src={photo("brew-offer1")} size={28} unoptimized eager />
                  <span>
                    <b>Ends 5pm</b> · 2-for-1 flat white
                  </span>
                </span>
                <span className="m-drop-chip">
                  <ShopImage src={photo("pedal-offer2")} size={28} unoptimized eager />
                  <span>Happy hour · Pedal &amp; Co.</span>
                </span>
              </div>
            </div>
            <div className="m-wipe" ref={wipe} hidden />
            <div className="m-view m-view-shop" ref={shopView} hidden data-parity="shop">
              <ShopPageHeader
                name={shop.name}
                meta={shop.meta}
                logoUrl={photo(`${shop.id}-logo`)}
                coverUrl={photo(`${shop.id}-cover`)}
                onBack={leave}
                rise
                titleAs="h3"
                unoptimized
              />
              <div className="m-shop-body">
                <div data-rise={3}>
                  <MiniVault gold={shop.gold} target={shop.target} />
                </div>
                <Button block resultLabel="Request sent" celebrate={false} data-rise={4}>
                  Request points
                </Button>
                <div className="m-offer-row" data-rise={5}>
                  {shop.offers.map(([file, title, detail]) => (
                    <OfferCard
                      key={file.slice(-6)}
                      imageUrl={photo(file)}
                      title={title}
                      detail={detail}
                      unoptimized
                      eager
                    />
                  ))}
                </div>
              </div>
            </div>
            <Dock
              label="App"
              placement="frame"
              parity="dock"
              active={current}
              column={column}
              columns={5}
            >
              {ITEMS.slice(0, 2).map(({ label, Glyph }, i) => (
                <button
                  key={label}
                  type="button"
                  data-liq
                  aria-current={current === i ? "page" : undefined}
                  className={DOCK_ITEM}
                  onClick={() => {
                    setCurrent(i);
                  }}
                >
                  <Glyph />
                  {label}
                </button>
              ))}
              <button
                type="button"
                aria-label="Scan"
                className={DOCK_SCAN}
                onClick={(e) => {
                  scanPress(e.currentTarget);
                  toast("The camera scanner opens here");
                }}
              >
                <DockScan />
              </button>
              {ITEMS.slice(2).map(({ label, Glyph }, k) => (
                <button
                  key={label}
                  type="button"
                  data-liq
                  aria-current={current === k + 2 ? "page" : undefined}
                  className={DOCK_ITEM}
                  onClick={() => {
                    setCurrent(k + 2);
                  }}
                >
                  <Glyph />
                  {label}
                </button>
              ))}
            </Dock>
          </div>
        </div>
        <VaultSection />
      </div>
    </section>
  );
}
