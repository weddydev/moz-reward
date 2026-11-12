"use client";

import { Bell, Coffee, Gift, MapPin, Plus, Settings, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ChipGroup,
  type Column,
  EmptyState,
  ErrorState,
  HeroCard,
  Icon,
  IconButton,
  KpiCard,
  MilestoneTrack,
  ProgressBar,
  RadioGroup,
  SegmentedControl,
  Select,
  ShopCard,
  Skeleton,
  Sparkline,
  Spinner,
  Switch,
  Table,
  Tabs,
  TextArea,
  TextField,
  Toaster,
  toast,
} from "@/components/ui";
import { PreferenceToggles } from "@/features/preferences/PreferenceToggles";
import { useHydrated } from "@/lib/use-hydrated";
import { OverlayDemos } from "./OverlayDemos";
import { Demo, Section, State } from "./Section";
import { TokenPage } from "./TokenPage";

/** Long-text fixtures (P0-09 AC 6): a long name, and an unbroken word longer than a 320px line. */
const LONG_NAME = "Patel's Corner Store, Leicester — a very long name to test wrapping";
const LONG_WORD = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch";

const CHIPS = [
  "Friendly staff",
  "Great coffee",
  "Quick service",
  "Cosy space",
  "Clean",
  "Value for money",
];

type Member = { name: string; memberId: string; visits: number; spend: string; last: string };
const MEMBERS: Member[] = [
  { name: "Aisha Khan", memberId: "K7Q-42M", visits: 18, spend: "£142.60", last: "7 Nov 2026" },
  { name: "Tom Fletcher", memberId: "R3D-9VX", visits: 9, spend: "£68.20", last: "2 Nov 2026" },
  { name: "Priya Shah", memberId: "M8N-2TC", visits: 4, spend: "£31.90", last: "28 Oct 2026" },
];
const FIRST = ["Aisha", "Tom", "Priya", "Owen", "Grace", "Hamza", "Niamh", "Leo", "Zara", "Callum"];
const LAST = ["Khan", "Fletcher", "Shah", "Evans", "Okafor"];
/** Enough rows that the table scrolls inside its region (sticky header, AC 9). */
const MANY_MEMBERS: Member[] = Array.from({ length: 24 }, (_, i) => ({
  name: `${FIRST[i % FIRST.length] ?? ""} ${LAST[i % LAST.length] ?? ""}`,
  memberId: `M${String(100 + i)}-${String.fromCharCode(65 + (i % 26))}Q`,
  visits: 30 - i,
  spend: `£${(240 - i * 7.35).toFixed(2)}`,
  last: `${String(1 + (i % 28))} Oct 2026`,
}));
const COLUMNS: Column<Member>[] = [
  { key: "name", header: "Name", cell: (r) => r.name, width: "11rem" },
  {
    key: "id",
    header: "Member ID",
    cell: (r) => <span className="font-mono">{r.memberId}</span>,
    width: "8.5rem",
  },
  { key: "visits", header: "Visits", cell: (r) => r.visits, numeric: true, width: "6rem" },
  { key: "spend", header: "Spend", cell: (r) => r.spend, numeric: true, width: "7rem" },
  { key: "last", header: "Last visit", cell: (r) => r.last, width: "9rem" },
];
const openRow = (r: Member): void => {
  toast(`Open ${r.name}`);
};
const rowLabel = (r: Member): string => `Open ${r.name}`;

const shopPhoto = (
  <div className="bg-gold-100 text-gold-700 grid size-full place-items-center">
    <Coffee aria-hidden="true" strokeWidth={1.5} />
  </div>
);

const MANY_TABS = [
  { value: "all", label: "All", count: 128 },
  { value: "pending", label: "Pending", count: 3 },
  { value: "approved", label: "Approved today", count: 12 },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
  { value: "refunded", label: "Refunded" },
] as const;
type ManyTab = (typeof MANY_TABS)[number]["value"];

/**
 * `/dev/ui` (P0-09): every primitive in its own `Demo` block with the states that apply to it. Prop states
 * (disabled, loading, error, selected, empty, edge values) are shown side by side; hover, focus-visible and
 * pressed are live on every control (DECISIONS "Gallery state matrix").
 */
export function UiGallery(): React.JSX.Element {
  const hydrated = useHydrated();
  const [chips, setChips] = useState<string[]>(["Great coffee"]);
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [tab, setTab] = useState<"pending" | "approved" | "expired">("pending");
  const [manyTab, setManyTab] = useState<ManyTab>("all");
  const [reminders, setReminders] = useState(true);
  const [sounds, setSounds] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState(true);
  const [terms, setTerms] = useState(false);
  const [rule, setRule] = useState<"visits" | "spend">("visits");
  const [shopType, setShopType] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [toastCount, setToastCount] = useState(0);

  const toastButton = (label: string, onClick: () => void) => (
    <Button variant="secondary" disabled={!hydrated} data-toast-trigger={label} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-5xl px-5 py-10"
      // Until this segment hydrates its controls are disabled (C-20). The page can hydrate after the root
      // layout's <html data-hydrated>, so tests also wait for no [data-hydrating] before measuring.
      data-hydrating={hydrated ? undefined : ""}
    >
      <p className="text-small text-gold-700 font-semibold">Dev only</p>
      <h1 className="text-display">UI gallery</h1>
      <p className="text-ink-2 mt-2 mb-8 max-w-prose">
        Every token (DESIGN.md §3, §7) and every primitive and state from DESIGN.md §6. Hover (mouse
        or trackpad only), focus and press are live on every control.
      </p>

      <Section title="Type scale">
        <p className="text-display">Display — Collect gold</p>
        <p className="text-h1">H1 — Brew &amp; Bloom Café</p>
        <p className="text-h2">H2 — Your Gold Vault</p>
        <p className="text-h3">H3 — Free coffee &amp; cake</p>
        <p className="text-body">Body — 1 more visit to your reward.</p>
        <p className="text-small text-ink-2">Small — Camden, London NW1</p>
        <p className="text-caption text-ink-2">Caption — Updated 7 Nov 2026, 17:05</p>
        <p className="text-h2 tabular">720 / 1,000 gold</p>
      </Section>

      <TokenPage />

      <Section title="Actions">
        <Demo name="Button">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["primary", "secondary", "ghost", "destructive"] as const).map((variant) => (
              <div key={variant} className="flex flex-col items-start gap-3">
                <State label={`${variant} · default`}>
                  <Button variant={variant}>
                    {variant === "destructive" ? "Delete account" : "Collect points"}
                  </Button>
                </State>
                <State label={`${variant} · disabled`}>
                  <Button variant={variant} disabled>
                    Disabled
                  </Button>
                </State>
                <State label={`${variant} · loading`}>
                  <Button variant={variant} loading>
                    Saving changes
                  </Button>
                </State>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <State label="size 40 + icon">
              <Button size={40} icon={<Plus aria-hidden="true" size={16} strokeWidth={1.5} />}>
                Sell
              </Button>
            </State>
            <State label="size 48">
              <Button size={48}>Request points</Button>
            </State>
            <State label="size 56">
              <Button size={56}>Redeem</Button>
            </State>
            <State label="loading on press">
              <Button
                loading={loading}
                disabled={!hydrated}
                onClick={() => {
                  setLoading(true);
                  setTimeout(() => {
                    setLoading(false);
                  }, 1500);
                }}
              >
                Approve request
              </Button>
            </State>
          </div>
          <div className="flex max-w-sm flex-col gap-3">
            <State label="block">
              <Button block>Full-width primary</Button>
            </State>
            <State label="long label">
              <Button block variant="secondary">
                Collect your points and unlock Free coffee &amp; cake at Brew &amp; Bloom
              </Button>
            </State>
          </div>
        </Demo>

        <Demo name="IconButton">
          <div className="flex flex-wrap items-end gap-4">
            <State label="ghost">
              <IconButton
                icon={Bell}
                label="Notifications"
                disabled={!hydrated}
                onClick={() => toast("Notifications")}
              />
            </State>
            <State label="secondary">
              <IconButton icon={Settings} label="Settings" variant="secondary" />
            </State>
            <State label="disabled">
              <IconButton icon={Plus} label="Add (disabled)" disabled />
            </State>
            <State label="secondary · disabled">
              <IconButton icon={Star} label="Favourite (disabled)" variant="secondary" disabled />
            </State>
          </div>
        </Demo>

        <Demo
          name="Icon"
          note="Per-icon imports, 1.5px stroke. Decorative icons are hidden from assistive tech."
        >
          <div className="flex flex-wrap items-end gap-4">
            {([14, 16, 18, 20, 24, 32] as const).map((size) => (
              <State key={size} label={`${String(size)}px`}>
                <Icon icon={MapPin} size={size} />
              </State>
            ))}
            <State label="labelled">
              <Icon icon={Bell} label="Notifications on" />
            </State>
          </div>
        </Demo>
      </Section>

      <Section title="Surfaces">
        <Demo name="Card">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <p className="text-h3">Card</p>
              <p className="text-small text-ink-2">Surface, radius 14, shadow-1.</p>
            </Card>
            <Card className="p-5">
              <p className="text-h3">Long unbroken word</p>
              <p className="text-small text-ink-2 [overflow-wrap:anywhere]">{LONG_WORD}</p>
            </Card>
          </div>
        </Demo>
        <Demo name="HeroCard">
          <HeroCard className="p-5">
            <p className="text-h3">Hero card</p>
            <p className="text-small text-ink-2">Radius 22 with a subtle foil texture.</p>
          </HeroCard>
        </Demo>
        <Demo
          name="ShopCard"
          note="Names wrap on word boundaries, up to two lines; an unbroken word longer than the line breaks anywhere."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <ShopCard
              name="Brew & Bloom Café"
              address="14 Parkway, Camden, London NW1 7AA"
              photo={shopPhoto}
              progress={0.72}
              progressLabel="72% · 1 more visit"
              badges={<Badge tone="open">Open now</Badge>}
            />
            <ShopCard
              name={LONG_NAME}
              address="221 Narborough Road, Leicester LE3 0PE, United Kingdom"
              photo={<div className="bg-surface-2 size-full" />}
              progress={0.25}
              progressLabel="25% · 250 / 1,000 gold"
              badges={
                <Badge
                  tone="happy-hour"
                  icon={<Sparkles aria-hidden="true" size={12} strokeWidth={1.5} />}
                >
                  Happy hour
                </Badge>
              }
            />
            <ShopCard
              name={LONG_WORD}
              address="Anglesey LL61 5UJ"
              photo={<div className="bg-surface-2 size-full" />}
              progress={0}
              progressLabel="0% · Start collecting"
            />
            <ShopCard
              name="Nan's Bakery"
              address="3 High Street, York YO1 8BN"
              photo={shopPhoto}
              progress={1}
              progressLabel="Reward ready"
              badges={<Badge tone="closed">Closed</Badge>}
            />
          </div>
        </Demo>
      </Section>

      <Section title="Forms">
        <Demo name="TextField">
          <div className="grid max-w-2xl gap-4 md:grid-cols-2">
            <TextField
              label="Full name"
              name="name"
              autoComplete="name"
              defaultValue="Aisha Khan"
            />
            <TextField
              label="UK mobile"
              name="phone"
              type="tel"
              inputMode="tel"
              hint="We'll only share it with shops you join."
            />
            <TextField
              label="Postcode"
              name="postcode"
              defaultValue="NW1"
              error="Please enter a full UK postcode."
            />
            <TextField label="Disabled" name="disabled" disabled defaultValue="Can't edit" />
            <TextField label="Empty" name="empty" placeholder="e.g. Brew & Bloom Café" />
            <TextField label="Long value" name="long" defaultValue={`${LONG_NAME} ${LONG_WORD}`} />
          </div>
        </Demo>
        <Demo name="TextArea">
          <div className="grid max-w-2xl gap-4 md:grid-cols-2">
            <TextArea label="Anything else? (optional)" name="note" maxLength={500} />
            <TextArea
              label="Reason"
              name="reason"
              error="Tell us why in a few words."
              hint="Shown to the shop owner."
            />
          </div>
        </Demo>
        <Demo name="Select">
          <div className="grid max-w-2xl gap-4 md:grid-cols-2">
            <Select
              label="Shop type"
              placeholder="Choose a shop type"
              value={shopType}
              onChange={(e) => {
                setShopType(e.currentTarget.value);
              }}
              options={[
                { value: "cafe", label: "Café" },
                {
                  value: "barber",
                  label: "Barber — beard trims, hot towel shaves and walk-ins welcome",
                },
                { value: "grocer", label: "Grocer" },
              ]}
            />
            <Select
              label="Region"
              defaultValue=""
              placeholder="Choose a region"
              error="Choose the region your shop is in."
              options={[
                { value: "london", label: "London" },
                { value: "midlands", label: "Midlands" },
              ]}
            />
            <Select
              label="Disabled select"
              disabled
              defaultValue="cafe"
              options={[{ value: "cafe", label: "Café" }]}
            />
            <Select
              label="Long selected option"
              defaultValue="barber"
              hint="The chosen text is cut with an ellipsis, never pushed past the arrow."
              options={[
                {
                  value: "barber",
                  label: "Barber — beard trims, hot towel shaves and walk-ins welcome all week",
                },
              ]}
            />
          </div>
        </Demo>
        <Demo name="Checkbox" note="The whole row is the target; the label toggles it.">
          <div className="flex max-w-md flex-col">
            <Checkbox
              label="Email me offers"
              description="About once a week. Unsubscribe any time."
              checked={offers}
              onCheckedChange={setOffers}
            />
            <Checkbox
              label="I agree to the terms"
              error={terms ? undefined : "Tick to continue."}
              checked={terms}
              onCheckedChange={setTerms}
            />
            <Checkbox label="Disabled, ticked" disabled defaultChecked />
            <Checkbox label="Disabled, not ticked" disabled />
            <Checkbox
              label={`Long label: ${LONG_NAME}, with more words to wrap onto a second line`}
            />
          </div>
        </Demo>
        <Demo name="RadioGroup">
          <div className="grid max-w-2xl gap-4 md:grid-cols-2">
            <RadioGroup
              label="Earn rule"
              name="rule"
              value={rule}
              onChange={setRule}
              options={[
                {
                  value: "visits",
                  label: "Per visit",
                  description: "One stamp each time a customer visits.",
                },
                { value: "spend", label: "Per £1 spent" },
              ]}
            />
            <RadioGroup
              label="Plan"
              name="plan"
              error="Choose a plan."
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
            <RadioGroup
              label="Disabled group"
              name="disabled-group"
              disabled
              defaultValue="a"
              options={[
                { value: "a", label: "Option A" },
                { value: "b", label: "Option B" },
              ]}
            />
          </div>
        </Demo>
        <Demo name="Switch" note="The whole row is the target.">
          <div className="flex max-w-sm flex-col">
            <Switch
              label="Birthday treat reminders"
              description="One email a year, a week before."
              checked={reminders}
              onCheckedChange={setReminders}
            />
            <Switch label="Sounds" checked={sounds} onCheckedChange={setSounds} />
            <Switch label="Disabled, on" checked disabled onCheckedChange={() => undefined} />
            <Switch
              label="Disabled, off"
              checked={false}
              disabled
              onCheckedChange={() => undefined}
            />
          </div>
        </Demo>
      </Section>

      <Section title="Selection and navigation">
        <Demo name="Chip">
          <div className="flex flex-wrap items-end gap-3">
            <State label="selected">
              <Chip selected onToggle={() => undefined}>
                Great coffee
              </Chip>
            </State>
            <State label="not selected">
              <Chip selected={false} onToggle={() => undefined}>
                Clean
              </Chip>
            </State>
            <State label="with icon">
              <Chip
                selected={false}
                onToggle={() => undefined}
                icon={<Coffee aria-hidden="true" size={16} strokeWidth={1.5} />}
              >
                Coffee
              </Chip>
            </State>
            <State label="disabled">
              <Chip selected={false} disabled onToggle={() => undefined}>
                Sold out
              </Chip>
            </State>
          </div>
        </Demo>
        <Demo name="ChipGroup" note="Wrapping, and a single row that scrolls inside itself.">
          <ChipGroup label="What stood out?">
            {CHIPS.map((c) => (
              <Chip
                key={c}
                selected={chips.includes(c)}
                onToggle={() => {
                  setChips((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
                }}
              >
                {c}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup label="Filter by category (one row)" wrap={false}>
            {["Cafés", "Barbers", "Bakeries", "Grocers", "Restaurants", "Florists", "Beauty"].map(
              (c) => (
                <Chip key={c} selected={c === "Cafés"} onToggle={() => undefined}>
                  {c}
                </Chip>
              ),
            )}
          </ChipGroup>
        </Demo>
        <Demo name="SegmentedControl">
          <div className="max-w-xs">
            <SegmentedControl
              label="Date range"
              value={range}
              onChange={setRange}
              options={[
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
              ]}
            />
          </div>
        </Demo>
        <Demo
          name="Tabs"
          note="Arrow keys move between tabs. Many tabs scroll inside their own row."
        >
          <Tabs
            label="Requests"
            value={tab}
            onChange={setTab}
            items={[
              { value: "pending", label: "Pending", count: 3 },
              { value: "approved", label: "Approved today", count: 12 },
              { value: "expired", label: "Expired" },
            ]}
          >
            <p className="text-ink-2">Showing: {tab}</p>
          </Tabs>
          <Tabs label="All requests" value={manyTab} onChange={setManyTab} items={MANY_TABS}>
            <p className="text-ink-2">Showing: {manyTab}</p>
          </Tabs>
        </Demo>
      </Section>

      <Section title="Preferences">
        <PreferenceToggles />
      </Section>

      <Section title="Status and progress">
        <Demo name="Badge">
          <div className="flex flex-wrap gap-2">
            <Badge tone="open">Open now</Badge>
            <Badge tone="closed">Closed</Badge>
            <Badge tone="warning">Closes soon</Badge>
            <Badge tone="happy-hour">Happy hour now</Badge>
            <Badge tone="featured">Featured</Badge>
            <Badge tone="private">Private seller</Badge>
            <Badge tone="business">Business seller</Badge>
            <Badge tone="neutral">Neutral</Badge>
            <Badge
              tone="happy-hour"
              icon={<Sparkles aria-hidden="true" size={12} strokeWidth={1.5} />}
            >
              With icon
            </Badge>
          </div>
        </Demo>
        <Demo
          name="ProgressBar"
          note="Values below 0, above 1 or not a number are clamped (0%, 100%, 0%)."
        >
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <State label="72%">
              <ProgressBar value={0.72} label="Brew & Bloom progress" className="w-full" />
            </State>
            <State label="0%">
              <ProgressBar value={0} label="Empty" className="w-full" />
            </State>
            <State label="100%, height 8">
              <ProgressBar value={1} label="Full" height={8} className="w-full" />
            </State>
            <State label="−0.5 → 0%">
              <ProgressBar value={-0.5} label="Below zero" className="w-full" />
            </State>
            <State label="1.4 → 100%">
              <ProgressBar value={1.4} label="Above one" className="w-full" />
            </State>
            <State label="NaN → 0%">
              <ProgressBar value={Number.NaN} label="Not a number" className="w-full" />
            </State>
          </div>
        </Demo>
        <Demo name="MilestoneTrack" note="No milestones renders nothing.">
          <MilestoneTrack
            label="Brew & Bloom rewards"
            steps={[
              { label: "Free biscuit", reached: true },
              { label: "Free coffee", reached: true },
              { label: "Coffee & cake for two, any size, any day", reached: false },
              { label: "Breakfast", reached: false },
            ]}
          />
          <MilestoneTrack
            label="All reached"
            steps={[
              { label: "Bronze", reached: true },
              { label: "Silver", reached: true },
            ]}
          />
          <MilestoneTrack
            label="None reached"
            steps={[
              { label: "First visit", reached: false },
              { label: "Fifth visit", reached: false },
              { label: "Tenth visit", reached: false },
            ]}
          />
          <MilestoneTrack
            label="One milestone"
            steps={[{ label: "First visit", reached: false }]}
          />
          <MilestoneTrack
            label="Long labels"
            steps={[
              { label: "Free biscuit with any hot drink before 10am", reached: true },
              { label: LONG_WORD, reached: false },
            ]}
          />
          <MilestoneTrack label="No milestones" steps={[]} />
        </Demo>
        <Demo name="Spinner" note="Under reduced motion it stops rotating and stays visible.">
          <div className="text-ink flex flex-wrap items-center gap-4">
            <Spinner size={16} />
            <Spinner />
            <Spinner size={32} />
          </div>
        </Demo>
        <Demo name="Skeleton">
          <div className="flex max-w-sm flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-4 w-2/3" rounded="pill" />
            <Skeleton className="h-4 w-1/2" rounded="pill" />
          </div>
        </Demo>
      </Section>

      <Section title="Dashboard">
        <Demo name="KpiCard">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Visits today"
              value="38"
              change={{ text: "+12% vs last Sunday", direction: "up" }}
              trend={[22, 25, 19, 30, 28, 34, 38]}
            />
            <KpiCard
              label="Gold issued"
              value="3,040"
              trend={[2100, 2500, 2400, 2900, 2700, 3100, 3040]}
              change={{ text: "−2% vs last week", direction: "down" }}
            />
            <KpiCard
              label="New customers"
              value="6"
              change={{ text: "Same as last week", direction: "flat" }}
            />
            <KpiCard label="Offers claimed" value="14" trend={[4, 6, 5, 9, 12, 11, 14]} />
          </div>
          <div className="grid grid-cols-2 gap-3" data-fixture="kpi-large">
            <KpiCard
              label="Revenue this year"
              value="£1,234,567.89"
              change={{ text: "+4% vs last year", direction: "up" }}
              trend={[900, 1000, 980, 1100, 1150, 1234]}
            />
            <KpiCard label="Average spend" value="£12.40" />
          </div>
        </Demo>
        <Demo name="Sparkline" note="Decorative; the KPI value carries the meaning.">
          <div className="text-gold-700 flex flex-wrap items-end gap-6">
            <State label="rising">
              <Sparkline values={[3, 5, 4, 7, 9, 8, 12]} />
            </State>
            <State label="flat">
              <Sparkline values={[5, 5, 5, 5]} />
            </State>
            <State label="one value">
              <Sparkline values={[5]} />
            </State>
            <State label="no values">
              <Sparkline values={[]} />
            </State>
          </div>
        </Demo>
        <Demo
          name="Table"
          note="Rows open with a click, Enter or Space. Sticky header inside the scroll region; a hint shows on the side with more content."
        >
          <Table
            caption="Customers"
            columns={COLUMNS}
            rows={MEMBERS}
            rowKey={(r) => r.memberId}
            onRowClick={openRow}
            rowLabel={rowLabel}
          />
          <Table
            caption="Customers (loading)"
            columns={COLUMNS}
            rows={[]}
            rowKey={(r) => r.memberId}
            loading
            loadingRows={3}
          />
          <Table
            caption="Customers (none yet)"
            columns={COLUMNS}
            rows={[]}
            rowKey={(r) => r.memberId}
            empty="No customers yet. They appear here after their first visit."
          />
          <Table
            caption="All customers"
            columns={COLUMNS}
            rows={MANY_MEMBERS}
            rowKey={(r) => r.memberId}
            onRowClick={openRow}
            rowLabel={rowLabel}
          />
        </Demo>
      </Section>

      <Section title="Empty, error, notifications">
        <Demo name="EmptyState">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <EmptyState
                title="No rewards yet"
                message="Collect gold at Brew & Bloom Café to unlock Free coffee & cake."
                action={
                  <Button
                    size={40}
                    variant="secondary"
                    icon={<Gift aria-hidden="true" size={16} strokeWidth={1.5} />}
                  >
                    See how it works
                  </Button>
                }
              />
            </Card>
            <Card>
              <EmptyState title="Nothing here" />
            </Card>
          </div>
        </Demo>
        <Demo name="ErrorState">
          <ErrorState
            message="We couldn't load your rewards. Check your connection and try again."
            retrying={retrying}
            onRetry={() => {
              setRetrying(true);
              setTimeout(() => {
                setRetrying(false);
              }, 1500);
            }}
          />
          <ErrorState
            title="This page isn't available"
            message="The shop may have closed its rewards. Nothing to retry."
          />
        </Demo>
        <Demo
          name="Toaster"
          note="At most 3 at once; the rest wait their turn. Errors interrupt (alert); the rest are polite. Hover, focus or a hidden tab pause the 4 s timer."
        >
          <div className="flex flex-wrap gap-3">
            {toastButton("Info toast", () => toast("Saved"))}
            {toastButton("Success toast", () => toast("+80 gold added", "success"))}
            {toastButton("Error toast", () =>
              toast("Something went wrong — please try again.", "error"),
            )}
            {toastButton("Five toasts", () => {
              const start = toastCount;
              for (let i = 1; i <= 5; i++) toast(`Toast ${String(start + i)}`);
              setToastCount(start + 5);
            })}
            {toastButton("Same message twice", () => {
              toast("Saved");
              toast("Saved");
            })}
          </div>
        </Demo>
      </Section>

      <Section title="Overlays">
        <OverlayDemos />
      </Section>

      <Section title="People">
        <Demo name="Avatar">
          <div className="flex flex-wrap items-end gap-4">
            <State label="56, labelled">
              <Avatar name="Aisha Khan" size={56} labelled />
            </State>
            <State label="initials">
              <Avatar name="Tom Fletcher" />
            </State>
            {/* A photo that fails to decode (no network request): falls back to initials. */}
            <State label="photo fails">
              <Avatar name="Priya Shah" src="data:image/png;base64,AAAA" />
            </State>
            <State label="no name">
              <Avatar size={32} />
            </State>
          </div>
        </Demo>
      </Section>
      <Toaster />
    </main>
  );
}
