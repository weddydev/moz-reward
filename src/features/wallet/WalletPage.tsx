import { Clock3, Gift, ScanLine } from "lucide-react";
import { TransitionLink } from "@/components/motion/TransitionLink";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { ShopCard } from "@/components/ui/ShopCard";
import { initialsOf } from "@/lib/initials";
import { PullToRefresh } from "./PullToRefresh";
import { AVAILABILITY_TEXT, type WalletCard, type WalletView, goldText, ingotsText } from "./view";

/**
 * The Wallet (P1-07, DESIGN §15 screen 3). Mobile: greeting, summary strip, the shop cards list (pull to
 * refresh). Desktop: greeting with the summary tiles beside it, a 3-column shop grid and a right column with
 * rewards ready and recent activity (rewards and ledger arrive with P1-12/P1-16, C-62; the daily game card
 * with P4-06, C-63). Each card opens the shop page, its logo and name morphing into the page header.
 */
export function WalletPage({
  view,
  greeting,
}: {
  view: WalletView;
  greeting: string;
}): React.JSX.Element {
  const { cards, summary } = view;
  return (
    <div
      data-page="wallet"
      className="mx-auto w-full max-w-[560px] px-4 pt-6 pb-8 md:max-w-none md:px-8 lg:max-w-[1280px] lg:px-10 lg:pt-10"
    >
      <PullToRefresh>
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
            <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                {/* The page is named "Wallet" like every portal page (P0-12); the greeting is its visible title. */}
                <h1 className="sr-only">Wallet</h1>
                <p className="text-h1 lg:text-display break-words" data-testid="wallet-greeting">
                  {greeting}
                </p>
                <p className="text-body text-ink-2 mt-1">
                  Your rewards, shops and gold, all in one place.
                </p>
              </div>
              <SummaryStrip
                rewardsReady={summary.rewardsReady}
                ingotsCompleted={summary.ingotsCompleted}
              />
            </header>

            {cards.length === 0 ? (
              <Card data-testid="wallet-empty">
                <EmptyState
                  title="No shops yet"
                  message="Scan a shop's QR code at the counter to join and start collecting gold."
                  action={
                    <TransitionLink
                      href="/scan"
                      direction="forward"
                      className={buttonClasses({ variant: "primary" })}
                    >
                      <Icon icon={ScanLine} />
                      Scan a QR code
                    </TransitionLink>
                  }
                />
              </Card>
            ) : (
              <section aria-labelledby="wallet-shops" className="flex flex-col gap-3">
                <h2 id="wallet-shops" className="text-h2">
                  Your shops ({cards.length})
                </h2>
                <ul
                  className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4 xl:grid-cols-3"
                  data-testid="wallet-cards"
                >
                  {cards.map((card) => (
                    <li key={card.membershipId} className="min-w-0">
                      <WalletShopCard card={card} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="hidden flex-col gap-6 lg:flex" aria-label="Rewards and activity">
            <Card className="flex flex-col gap-2 p-5" data-testid="wallet-rewards-ready">
              <h2 className="text-h3 flex items-center gap-2">
                <Icon icon={Gift} className="text-gold-700" />
                Rewards ready ({summary.rewardsReady})
              </h2>
              <p className="text-small text-ink-2">
                Nothing to redeem yet. Fill an ingot to unlock a shop&rsquo;s reward.
              </p>
            </Card>
            <Card className="flex flex-col gap-2 p-5" data-testid="wallet-activity">
              <h2 className="text-h3 flex items-center gap-2">
                <Icon icon={Clock3} className="text-gold-700" />
                Recent activity
              </h2>
              <p className="text-small text-ink-2">Gold you collect will show here.</p>
            </Card>
          </aside>
        </div>
      </PullToRefresh>
    </div>
  );
}

function SummaryStrip({
  rewardsReady,
  ingotsCompleted,
}: {
  rewardsReady: number;
  ingotsCompleted: number;
}): React.JSX.Element {
  const tiles = [
    { label: "Rewards ready", value: rewardsReady, icon: <Icon icon={Gift} />, id: "rewards" },
    { label: "Ingots filled", value: ingotsCompleted, icon: <IngotIcon />, id: "ingots" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 xl:flex xl:shrink-0" aria-label="Summary">
      {tiles.map((t) => (
        <li key={t.id}>
          <Card
            className="flex h-full items-center gap-3 px-4 py-3 xl:min-w-[168px]"
            data-testid={`summary-${t.id}`}
          >
            <span className="text-gold-700 shrink-0" aria-hidden="true">
              {t.icon}
            </span>
            <p className="flex min-w-0 flex-col">
              <span className="text-h2 tabular">{t.value.toLocaleString("en-GB")}</span>
              <span className="text-small text-ink-2">{t.label}</span>
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** Small ingot outline (gold-700 line art, like the empty-state illustrations). */
function IngotIcon(): React.JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6 7h12l4 11H2z" strokeLinejoin="round" />
      <path d="M9 11h6" strokeLinecap="round" />
    </svg>
  );
}

function WalletShopCard({ card }: { card: WalletCard }): React.JSX.Element {
  const unavailable = card.availability !== "live";
  const badges = unavailable ? (
    <Badge tone="closed">{AVAILABILITY_TEXT[card.availability as "suspended" | "closed"]}</Badge>
  ) : card.open ? (
    <Badge tone={card.open.tone}>{card.open.text}</Badge>
  ) : null;
  const gold = card.ingotSize ? goldText(card.progressGold, card.ingotSize) : null;
  return (
    <TransitionLink
      href={`/shops/${card.shopId}`}
      direction="forward"
      hero={{ id: card.shopId, name: card.name, imageUrl: card.logoUrl }}
      className="pressable block h-full rounded-md"
      data-testid="wallet-card"
      data-availability={card.availability}
      aria-label={[
        card.name,
        unavailable ? AVAILABILITY_TEXT[card.availability as "suspended" | "closed"] : null,
        card.open?.text ?? null,
        gold,
        card.label,
        card.ingotsCompleted ? ingotsText(card.ingotsCompleted) : null,
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <ShopCard
        name={card.name}
        address={card.address}
        sharedId={card.shopId}
        dimmed={unavailable}
        progress={card.progress}
        progressLabel={card.label}
        badges={badges}
        className="hover:shadow-2 h-full transition-shadow"
        photo={
          card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.logoUrl}
              alt=""
              width={64}
              height={64}
              className="size-full object-cover"
            />
          ) : (
            <span className="bg-gold-100 text-h3 text-ink grid size-full place-items-center">
              {initialsOf(card.name)}
            </span>
          )
        }
      />
    </TransitionLink>
  );
}
