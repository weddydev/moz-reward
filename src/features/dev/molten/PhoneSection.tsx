"use client";

import { useState } from "react";
import { Dock, DOCK_ITEM, DOCK_SCAN, scanPress } from "@/components/ui/Dock";
import { DockMarket, DockMe, DockOffers, DockScan, DockWallet } from "@/components/ui/dock-icons";
import { toast } from "@/components/ui/Toast";
import { frauncesItalic } from "@/styles/fonts-italic";

const ITEMS = [
  { label: "Wallet", Glyph: DockWallet },
  { label: "Offers", Glyph: DockOffers },
  { label: "Market", Glyph: DockMarket },
  { label: "Me", Glyph: DockMe },
] as const;

/**
 * The reference's "Phone" section (`#phone`) on `/dev/molten`: the phone frame with its status bar and the
 * Wallet view's background, and the floating dock (PD-07) placed in the frame. The dock's items are buttons here,
 * as in the reference (choosing one pours the gold; Scan presses, sparks and says where the scanner opens).
 * The wallet stack and the shop page fill the phone in PD-08, the Gold Vault its neighbour column in PD-10.
 */
export function PhoneSection(): React.JSX.Element {
  const [current, setCurrent] = useState(0);
  // Columns: Wallet, Offers, Scan, Market, Me; the gold sits on the four items, never on Scan.
  const column = current < 2 ? current : current + 1;
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
          <div className="m-screen">
            <div className="m-status" aria-hidden="true">
              <span>17:42</span>
              <span>5G ▮▮▮</span>
            </div>
            <div className="m-view m-view-wallet" />
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
        <div />
      </div>
    </section>
  );
}
