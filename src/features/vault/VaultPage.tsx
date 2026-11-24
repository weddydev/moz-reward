import { ChevronLeft, Coins, Crown, Flame, Gift, Sparkles } from "lucide-react";
import { TransitionLink } from "@/components/motion/TransitionLink";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button-classes";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { GoldVault } from "@/components/ui/GoldVault";
import { Icon } from "@/components/ui/Icon";
import { MilestoneTrack } from "@/components/ui/MilestoneTrack";
import { cx } from "@/lib/cx";
import { nextTierText, shelfText, type VaultView } from "./view";

/**
 * Gold Vault, screen 5 (DESIGN §15; P1-08, Molten PD-11). Mobile: the Molten vault (the shop's eyebrow, the
 * reward the ingot is for, gold to go, the count and the pouring ingot), horizontal milestones, streak, tiers,
 * the Vault shelf, rewards ready, how it works. Desktop (≥ 1024px): the vault left, vertical milestone timeline
 * and tiers right, then the shelf, rewards and how-it-works band. The page's h1 is for screen readers: the
 * vault's own eyebrow ("Gold Vault · <shop>") is the visible title, as in the reference. Server component; only
 * the vault is client code. Unlocking (rays, reward card) and "Rewards ready" with Redeem come with the real
 * rewards (P1-15/P1-16, CARRIED).
 */
export function VaultPage({
  shop,
  view,
}: {
  shop: { shopId: string; name: string; logoUrl: string | null };
  view: VaultView | null;
}): React.JSX.Element {
  return (
    <div
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-6 lg:max-w-[1120px] lg:py-8"
      data-page="vault"
    >
      <TransitionLink
        href={`/shops/${shop.shopId}`}
        direction="back"
        className="text-small text-ink-2 hit-44 inline-flex min-w-0 items-center gap-1 self-start"
        data-testid="vault-back"
      >
        <Icon icon={ChevronLeft} size={16} />
        <span className="truncate">{shop.name}</span>
      </TransitionLink>

      <h1 className="sr-only">Your Gold Vault</h1>

      {view ? (
        <Vault shop={shop} view={view} />
      ) : (
        <Card data-testid="vault-not-set-up">
          <EmptyState
            title="Rewards not set up yet"
            message={`${shop.name} hasn't set up its Gold Vault yet. Check back soon.`}
            action={
              <TransitionLink
                href={`/shops/${shop.shopId}`}
                direction="back"
                className={buttonClasses({ variant: "orbit" })}
              >
                Back to the shop
              </TransitionLink>
            }
          />
        </Card>
      )}
    </div>
  );
}

function Vault({
  shop,
  view,
}: {
  shop: { shopId: string; name: string; logoUrl: string | null };
  view: VaultView;
}): React.JSX.Element {
  const { ingot, steps, streak, tier, shelf, howItWorks } = view;
  const main = steps.find((s) => s.main);
  return (
    <>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <GoldVault
          shop={{ name: shop.name, logoUrl: shop.logoUrl }}
          title={main?.title ?? "Your reward"}
          gold={ingot.gold}
          size={ingot.size}
          ingots={tier.ingots}
          {...(view.perVisit === null ? {} : { perVisit: view.perVisit })}
          seenKey={shop.shopId}
        />

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-h2 flex items-center gap-2">
                <Icon icon={Gift} className="text-gold-deep" /> Milestone rewards
              </h2>
              {streak ? <StreakChip bonusGold={streak.bonusGold} /> : null}
            </div>
            <MilestoneTrack
              label="Rewards in this ingot"
              steps={steps.map((s) => ({
                label: `${String(s.percent)}%`,
                detail: s.title,
                reached: s.reached,
              }))}
              className="lg:pl-1"
            />
          </Card>

          <Card className="flex flex-col gap-4 p-5" data-testid="vault-tier">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-h2 flex items-center gap-2">
                <Icon icon={Crown} className="text-gold-deep" /> Your tier
              </h2>
              <p className="text-small text-ink-2">
                {tier.next ? nextTierText(tier.next) : "You've reached the top tier"}
              </p>
            </div>
            <ol className="grid grid-cols-3 gap-2" aria-label="Tiers">
              {tier.ladder.map((t) => (
                <li
                  key={t.name}
                  aria-current={t.current ? "true" : undefined}
                  className="flex flex-col items-center gap-1 text-center"
                >
                  <span aria-hidden="true" className="size-11">
                    {/* The current tier is a gold coin; the others are quiet outlines. */}
                    <span
                      className={cx(
                        t.current
                          ? "m-coin"
                          : "border-line text-ink-3 grid size-full place-items-center rounded-full border-2",
                      )}
                    >
                      <Crown size={20} strokeWidth={1.5} />
                    </span>
                  </span>
                  <span className={cx("text-small", t.current ? "font-semibold" : "text-ink-2")}>
                    {t.name}
                  </span>
                  <span className="text-caption text-ink-2">
                    {t.from === 0 ? "From the start" : `${String(t.from)}+ ingots`}
                  </span>
                  {t.current ? (
                    <Badge tone="happy-hour" className="mt-1">
                      Current tier
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start">
        <Card className="flex flex-col gap-4 p-5" data-testid="vault-shelf">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-h2">My Vault</h2>
            <p className="text-small text-ink-2">{shelfText(shelf.completed, ingot.size)}</p>
          </div>
          {/* The count above says it; the pictures are decoration. */}
          <ul className="flex flex-wrap gap-2" aria-hidden="true">
            {Array.from({ length: shelf.slots }, (_, i) => (
              <li key={i} className="w-[calc((100%-2rem)/5)] min-w-10">
                <ShelfIngot filled={i < shelf.completed} />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-3 p-5" data-testid="vault-rewards">
          <h2 className="text-h2 flex items-center gap-2">
            <Icon icon={Sparkles} className="text-gold-deep" /> Rewards ready
          </h2>
          <p className="text-small text-ink-2">
            Nothing to redeem yet. Rewards appear here when you reach a milestone or fill your ingot
            at {shop.name}.
          </p>
        </Card>

        <Card
          className="flex scroll-mt-6 flex-col gap-3 p-5"
          id="how-it-works"
          data-testid="vault-how"
        >
          <h2 className="text-h2">How it works</h2>
          <ul className="flex flex-col gap-3">
            <HowRow icon={Coins} title="Earn gold" text={howItWorks.earn} />
            <HowRow icon={Gift} title="Unlock rewards" text={howItWorks.unlock} />
            <HowRow icon={Crown} title="Grow your tier" text={howItWorks.tiers} />
          </ul>
        </Card>
      </div>
    </>
  );
}

function StreakChip({ bonusGold }: { bonusGold: number }): React.JSX.Element {
  return (
    <span
      className="rounded-pill bg-surface-2 text-small text-ink inline-flex min-h-8 items-center gap-1.5 px-3 py-1"
      data-testid="vault-streak"
    >
      <Icon icon={Flame} size={16} className="text-gold-deep" />
      Visit 2 weeks running for +{bonusGold} bonus gold
    </span>
  );
}

function HowRow({
  icon,
  title,
  text,
}: {
  icon: typeof Coins;
  title: string;
  text: string;
}): React.JSX.Element {
  return (
    <li className="flex items-start gap-3">
      <Icon icon={icon} className="text-gold-deep mt-0.5" />
      <div className="flex min-w-0 flex-col">
        <span className="text-small font-semibold">{title}</span>
        <span className="text-small text-ink-2">{text}</span>
      </div>
    </li>
  );
}

/** A small ingot on the shelf: gold when filled, a dashed outline for the ones still to come. */
function ShelfIngot({ filled }: { filled: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 240 140" className="block h-auto w-full" aria-hidden="true">
      <polygon
        points="66,14 174,14 192,40 226,124 14,124 48,40"
        fill={filled ? "var(--gold)" : "none"}
        stroke={filled ? "var(--gold-deep)" : "var(--ink-3)"}
        strokeWidth="8"
        strokeLinejoin="round"
        strokeDasharray={filled ? undefined : "16 12"}
      />
      {filled ? (
        <polyline points="48,40 192,40" stroke="var(--gold-light)" strokeWidth="8" fill="none" />
      ) : null}
    </svg>
  );
}
