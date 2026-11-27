"use client";

import { useState } from "react";
import { CountUp } from "@/components/motion/CountUp";
import { IngotPour } from "@/components/motion/IngotPour";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CoverPhoto } from "@/components/ui/CoverPhoto";
import { Dock, DOCK_ITEM, DOCK_SCAN, scanPress } from "@/components/ui/Dock";
import { DockMarket, DockMe, DockOffers, DockScan, DockWallet } from "@/components/ui/dock-icons";
import { GoldVault } from "@/components/ui/GoldVault";
import { Ingot } from "@/components/ui/Ingot";
import { MemberCard, MemberCardQrPlaceholder } from "@/components/ui/MemberCard";
import { MiniVault } from "@/components/ui/MiniVault";
import { ReceiptCard } from "@/components/ui/ReceiptCard";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { RewardUnlocked } from "@/components/ui/RewardUnlocked";
import { ShopCoin, ShopImage } from "@/components/ui/ShopImage";
import { Slider } from "@/components/ui/Slider";
import { StarRating } from "@/components/ui/StarRating";
import { toast } from "@/components/ui/Toast";
import { Demo, State } from "./Section";

/**
 * C-94 (P1-C close): the Molten parts built in PD and P1 that `src/components/ui` doesn't re-export, and the motion
 * components a person looks at, each in its states, so they can be reviewed side by side with the Molten demo
 * (`design/reference/molten/`). The interactive ones work here exactly as in the app (same components).
 */

const photo = (file: string): string => `/demo/shops/${file}.jpg`;
const NOTCHES = [
  { value: 0, label: "0" },
  { value: 240, label: "Pastry" },
  { value: 480, label: "Coffee" },
  { value: 720, label: "All 720" },
] as const;
const DOCK_ITEMS = [
  { label: "Wallet", Glyph: DockWallet },
  { label: "Offers", Glyph: DockOffers },
  { label: "Market", Glyph: DockMarket },
  { label: "Me", Glyph: DockMe },
] as const;
/** Grid column of the n-th dock item: the Scan coin takes the middle one. */
const dockColumn = (n: number): number => (n < 2 ? n : n + 1);

function SliderDemo(): React.JSX.Element {
  const [spend, setSpend] = useState(240);
  const [disabled] = useState(200);
  return (
    <div className="grid w-full max-w-xl gap-6">
      <State label="with reward notches (sparks when crossing one going up)">
        <Slider
          label="Gold to spend"
          min={0}
          max={720}
          step={10}
          value={spend}
          onChange={setSpend}
          notches={NOTCHES}
          valueText={(v) => `${v.toLocaleString("en-GB")} of 720 gold`}
          className="w-full"
        />
      </State>
      <State label="disabled">
        <Slider
          label="Gold to spend (disabled)"
          max={720}
          value={disabled}
          onChange={() => undefined}
          disabled
          className="w-full"
        />
      </State>
    </div>
  );
}

function StarRatingDemo(): React.JSX.Element {
  const [rating, setRating] = useState(0);
  const [rated] = useState(4);
  return (
    <div className="flex flex-wrap gap-8">
      <State label="not rated yet (tap a star)">
        <StarRating value={rating} onChange={setRating} />
      </State>
      <State label="rated 4: the same two equal choices for every rating">
        <StarRating value={rated} onChange={() => undefined} label="Rated visit" />
      </State>
    </div>
  );
}

function DockDemo(): React.JSX.Element {
  const [current, setCurrent] = useState(0);
  return (
    <div className="bg-surface-2 relative h-36 w-full max-w-sm overflow-hidden rounded-3xl">
      <Dock
        label="Dock demo"
        placement="frame"
        active={current}
        column={dockColumn(current)}
        columns={5}
      >
        {DOCK_ITEMS.slice(0, 2).map(({ label, Glyph }, i) => (
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
          className={DOCK_SCAN}
          onClick={(e) => {
            scanPress(e.currentTarget);
          }}
        >
          <DockScan />
          <span className="sr-only">Scan</span>
        </button>
        {DOCK_ITEMS.slice(2).map(({ label, Glyph }, k) => (
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
  );
}

function VaultDemo(): React.JSX.Element {
  const [gold, setGold] = useState(620);
  const [unlocked, setUnlocked] = useState(false);
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <GoldVault
        shop={{ name: "Brew & Bloom", logoUrl: photo("brew-logo") }}
        title="Free coffee & cake"
        gold={gold}
        size={1_000}
        perVisit={120}
        seenKey="dev-ui-vault"
        unlocked={unlocked}
        onFull={() => {
          setUnlocked(true);
        }}
        unoptimized
        reward={
          <RewardUnlocked
            detail="Free coffee & cake · Brew & Bloom Café"
            imageUrl={photo("brew-offer2")}
            celebrate
            toastText="Reward unlocked: free coffee & cake"
            unoptimized
          />
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size={46}
          variant="orbit"
          disabled={gold >= 1_000}
          onClick={() => {
            setGold((g) => Math.min(1_000, g + 120));
          }}
        >
          Pour a visit (+120)
        </Button>
        <Button
          size={46}
          variant="ghost"
          onClick={() => {
            setGold(620);
            setUnlocked(false);
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

function RedeemDemo(): React.JSX.Element {
  const [code, setCode] = useState<{ expiresAt: number; serverNow: number } | null>(null);
  // Started by a press, never on load: a gallery that toasts by itself 10 s in breaks every test still on the page
  // then (overlays "toast open: axe clean" saw two toasts on CI WebKit, 45776909717).
  const [soon, setSoon] = useState<{ expiresAt: number; serverNow: number } | null>(null);
  return (
    <div className="flex flex-wrap gap-8">
      <State label="live code (15 min countdown)">
        {code ? (
          <RedeemCode code="K7Q42M" expiresAt={code.expiresAt} serverNow={code.serverNow} />
        ) : (
          <Button
            onClick={() => {
              const now = Date.now();
              setCode({ expiresAt: now + 15 * 60_000, serverNow: now });
            }}
          >
            Show redeem code
          </Button>
        )}
      </State>
      <State label="expiring (10 s left)">
        {soon ? (
          <RedeemCode
            code="R3D9VX"
            expiresAt={soon.expiresAt}
            serverNow={soon.serverNow}
            onExpire={() => {
              toast("Code expired: tap Redeem for a new one");
            }}
          />
        ) : (
          <Button
            variant="orbit"
            onClick={() => {
              const now = Date.now();
              setSoon({ expiresAt: now + 10_000, serverNow: now });
            }}
          >
            Show an expiring code
          </Button>
        )}
      </State>
    </div>
  );
}

function CountUpDemo(): React.JSX.Element {
  const [n, setN] = useState(1_240);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <CountUp className="text-display font-semibold" value={n} />
      <Button
        size={46}
        variant="orbit"
        onClick={() => {
          setN((v) => v + 380);
        }}
      >
        Add 380
      </Button>
    </div>
  );
}

function IngotPourDemo(): React.JSX.Element {
  const [run, setRun] = useState(0);
  const [gold, setGold] = useState(450);
  return (
    <div className="flex flex-wrap items-end gap-6">
      <div className="w-32">
        <IngotPour key={run} gold={gold} size={1_000} marks={[25, 50, 75]} seenKey="dev-ui-ingot" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size={46}
          variant="orbit"
          onClick={() => {
            setGold((g) => Math.min(1_000, g + 150));
          }}
        >
          Pour +150
        </Button>
        <Button
          size={46}
          variant="ghost"
          onClick={() => {
            setGold(450);
            setRun((r) => r + 1);
          }}
        >
          Replay from empty
        </Button>
      </div>
    </div>
  );
}

export function MoltenParts(): React.JSX.Element {
  return (
    <>
      <Demo
        name="Slider"
        note="Bubble leans with the drag speed and swings back; keyboard steps by 10."
      >
        <SliderDemo />
      </Demo>
      <Demo name="StarRating" note="Stars ignite one after another with a spark each.">
        <StarRatingDemo />
      </Demo>
      <Demo
        name="MemberCard"
        note="Tilt and glare follow the pointer; tap flips it to the QR side."
      >
        <div className="w-full max-w-sm">
          <MemberCard
            name="Aisha Khan"
            memberId="K7Q-42M"
            tier="Gold member"
            since="since Nov 2026"
            backText="Show this at the till · K7Q-42M"
            back={<MemberCardQrPlaceholder />}
            backLabel="Member card showing a QR code placeholder. Press to turn back"
          />
        </div>
      </Demo>
      <Demo name="Dock" note="Gold pours between items; the Scan coin squeezes and sparks.">
        <DockDemo />
      </Demo>
      <Demo name="GoldVault" note="Pours on view; fill it to see the reward unlock.">
        <VaultDemo />
      </Demo>
      <Demo name="RewardUnlocked" note="The unlocked reward card on its own (no celebration).">
        <div className="w-full max-w-md">
          <RewardUnlocked
            detail="Free pastry · Camden Bakehouse"
            imageUrl={photo("bake-offer1")}
            unoptimized
          />
        </div>
      </Demo>
      <Demo
        name="ReceiptCard"
        note="A digital receipt at rest; it prints on arrival (/dev/motion Celebrations)."
      >
        <div className="flex w-full max-w-md flex-col gap-4">
          <State label="Amount and items">
            <ReceiptCard
              receipt={{
                id: "00000000-0000-4000-8000-000000000301",
                number: 128,
                shopName: "Brew & Bloom Café",
                address: "12 Market Street, Leeds LS1 6DT",
                vatNumber: null,
                approvedAt: "2026-11-26T14:05:00.000Z",
                items: ["Flat white", "Almond croissant"],
                amountPence: 840,
                goldEarned: 80,
                bonusGold: 0,
                staffInitials: "SL",
              }}
            />
          </State>
          <State label="VAT number, streak bonus, per visit">
            <ReceiptCard
              receipt={{
                id: "00000000-0000-4000-8000-000000000302",
                number: 1_204,
                shopName: "Camden Bakehouse",
                address: null,
                vatNumber: "GB123456789",
                approvedAt: "2026-11-26T09:30:00.000Z",
                items: [],
                amountPence: null,
                goldEarned: 100,
                bonusGold: 50,
                staffInitials: "AK",
              }}
            />
          </State>
        </div>
      </Demo>
      <Demo name="RedeemCode">
        <RedeemDemo />
      </Demo>
      <Demo name="MiniVault">
        <div className="flex w-full max-w-md flex-col gap-4">
          <State label="72%">
            <div className="w-full">
              <MiniVault gold={720} target={1_000} />
            </div>
          </State>
          <State label="empty">
            <div className="w-full">
              <MiniVault gold={0} target={1_000} />
            </div>
          </State>
          <State label="full">
            <div className="w-full">
              <MiniVault gold={1_000} target={1_000} label="Ready to redeem" />
            </div>
          </State>
        </div>
      </Demo>
      <Demo name="Ingot" note="Static ingot (no pour) at 0, 50%, 99% and full.">
        <div className="grid max-w-xl grid-cols-4 gap-4">
          {[0, 500, 990, 1_000].map((g) => (
            <State key={g} label={`${String(g / 10)}%`}>
              <Ingot gold={g} size={1_000} marks={[25, 50, 75]} />
            </State>
          ))}
        </div>
      </Demo>
      <Demo
        name="IngotPour"
        note="The pour plays on the first view of a session; pour more to see it rise."
      >
        <IngotPourDemo />
      </Demo>
      <Demo name="CountUp" note="Digits roll to the new number.">
        <CountUpDemo />
      </Demo>
      <Demo name="GildedEdge" note="The gold edge that draws round a placed card.">
        <div className="w-full max-w-sm">
          <Card variant="placed" gilded>
            <p className="p-5">Placed card with the gilded edge.</p>
          </Card>
        </div>
      </Demo>
      <Demo
        name="CoverPhoto"
        note="A shop cover. A broken image removes itself, so the page's own fallback shows (here: the empty box)."
      >
        <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <State label="photo">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl">
              <CoverPhoto src={photo("brew-cover")}>
                <ShopImage
                  src={photo("brew-cover")}
                  sizes="(min-width: 640px) 320px, 100vw"
                  unoptimized
                />
              </CoverPhoto>
            </div>
          </State>
          <State label="broken image">
            <div className="bg-champagne relative aspect-video w-full overflow-hidden rounded-2xl">
              <CoverPhoto src="/demo/shops/missing-cover.jpg">
                <ShopImage src="/demo/shops/missing-cover.jpg" sizes="320px" unoptimized />
              </CoverPhoto>
            </div>
          </State>
        </div>
      </Demo>
      <Demo name="ShopImage" note="A shop's logo or offer photo in a square box.">
        <div className="flex flex-wrap items-end gap-4">
          {[28, 44, 64].map((size) => (
            <State key={size} label={`${String(size)} px`}>
              <ShopImage src={photo("pedal-logo")} size={size} unoptimized />
            </State>
          ))}
        </div>
      </Demo>
      <Demo
        name="ShopCoin"
        note="A shop without a logo: its initials on a metal coin filling the logo box."
      >
        <div className="flex flex-wrap items-end gap-4">
          <State label="44 px">
            <span className="block size-11">
              <ShopCoin name="Brew & Bloom" size={44} />
            </span>
          </State>
          <State label="64 px, long name">
            <span className="block size-16">
              <ShopCoin name="Patel's Corner Store, Leicester" size={64} />
            </span>
          </State>
        </div>
      </Demo>
    </>
  );
}
