"use client";

import { Bell, Coffee, Gift, MapPin, Plus, Settings, Sparkles } from "lucide-react";
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
  Switch,
  Table,
  Tabs,
  TextArea,
  TextField,
  Toaster,
  toast,
} from "@/components/ui";
import { PreferenceToggles } from "@/features/preferences/PreferenceToggles";
import { OverlayDemos } from "./OverlayDemos";
import { Section } from "./Section";
import { TokenPage } from "./TokenPage";

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
const COLUMNS: Column<Member>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
  { key: "id", header: "Member ID", cell: (r) => <span className="font-mono">{r.memberId}</span> },
  { key: "visits", header: "Visits", cell: (r) => r.visits, numeric: true },
  { key: "spend", header: "Spend", cell: (r) => r.spend, numeric: true },
  { key: "last", header: "Last visit", cell: (r) => r.last },
];

export function UiGallery(): React.JSX.Element {
  const [chips, setChips] = useState<string[]>(["Great coffee"]);
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [tab, setTab] = useState<"pending" | "approved" | "expired">("pending");
  const [sounds, setSounds] = useState(true);
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState(true);
  const [terms, setTerms] = useState(false);
  const [rule, setRule] = useState<"visits" | "spend">("visits");
  const [shopType, setShopType] = useState("");
  const [retrying, setRetrying] = useState(false);

  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-5 py-10">
      <p className="text-small text-gold-700 font-semibold">Dev only</p>
      <h1 className="text-display">UI gallery</h1>
      <p className="text-ink-2 mt-2 max-w-prose">
        Every token (DESIGN.md §3, §7) and every primitive and state from DESIGN.md §6.
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

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Collect points</Button>
          <Button variant="secondary">Rate your visit</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="destructive">Delete account</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size={40} icon={<Plus aria-hidden="true" size={16} strokeWidth={1.5} />}>
            Sell
          </Button>
          <Button size={48}>Request points</Button>
          <Button size={56}>Redeem</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => {
                setLoading(false);
              }, 1500);
            }}
          >
            Approve request
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" loading>
            Saving changes
          </Button>
        </div>
        <div className="max-w-sm">
          <Button block>Full-width primary</Button>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <p className="text-h3">Card</p>
            <p className="text-small text-ink-2">Surface, radius 14, shadow-1.</p>
          </Card>
          <HeroCard className="p-5">
            <p className="text-h3">Hero card</p>
            <p className="text-small text-ink-2">Radius 22 with a subtle foil texture.</p>
          </HeroCard>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ShopCard
            name="Brew & Bloom Café"
            address="14 Parkway, Camden, London NW1 7AA"
            photo={
              <div className="bg-gold-100 text-gold-700 grid size-full place-items-center">
                <Coffee aria-hidden="true" strokeWidth={1.5} />
              </div>
            }
            progress={0.72}
            progressLabel="72% · 1 more visit"
            badges={<Badge tone="open">Open now</Badge>}
          />
          <ShopCard
            name="Patel's Corner Store, Leicester — a very long name to test truncation"
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
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-2xl gap-4 md:grid-cols-2">
          <TextField label="Full name" name="name" autoComplete="name" defaultValue="Aisha Khan" />
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
          <TextArea
            label="Anything else? (optional)"
            name="note"
            maxLength={500}
            className="md:col-span-2"
          />
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
        </div>
        <div className="grid max-w-2xl gap-4 md:grid-cols-2">
          <div className="flex flex-col">
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
            <Checkbox label="Disabled checkbox" disabled defaultChecked />
          </div>
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
        </div>
      </Section>

      <Section title="Icons, icon buttons, avatars">
        <div className="flex flex-wrap items-center gap-3">
          <Icon icon={MapPin} />
          <Icon icon={Bell} label="Notifications on" />
          <IconButton icon={Bell} label="Notifications" onClick={() => toast("Notifications")} />
          <IconButton icon={Settings} label="Settings" variant="secondary" />
          <IconButton icon={Plus} label="Add (disabled)" disabled />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name="Aisha Khan" size={56} labelled />
          <Avatar name="Tom Fletcher" />
          {/* A photo that fails to decode (no network request): falls back to initials. */}
          <Avatar name="Priya Shah" src="data:image/png;base64,AAAA" />
          <Avatar size={32} />
        </div>
      </Section>

      <Section title="Milestone track">
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
        <MilestoneTrack label="One milestone" steps={[{ label: "First visit", reached: false }]} />
      </Section>

      <Section title="Chips, segmented control, tabs, switch">
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
        <div className="max-w-sm">
          <Switch
            label="Birthday treat reminders"
            description="One email a year, a week before."
            checked={sounds}
            onCheckedChange={setSounds}
          />
        </div>
      </Section>

      <Section title="Preferences">
        <PreferenceToggles />
      </Section>

      <Section title="Badges and progress">
        <div className="flex flex-wrap gap-2">
          <Badge tone="open">Open now</Badge>
          <Badge tone="closed">Closed</Badge>
          <Badge tone="warning">Closes soon</Badge>
          <Badge tone="happy-hour">Happy hour now</Badge>
          <Badge tone="featured">Featured</Badge>
          <Badge tone="private">Private seller</Badge>
          <Badge tone="business">Business seller</Badge>
        </div>
        <div className="flex max-w-sm flex-col gap-2">
          <ProgressBar value={0.72} label="Brew & Bloom progress" />
          <p className="text-caption text-gold-700 tabular font-semibold">72% · 1 more visit</p>
          <ProgressBar value={1} label="Full" height={8} />
        </div>
      </Section>

      <Section title="Dashboard">
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
        <Table
          caption="Customers"
          columns={COLUMNS}
          rows={MEMBERS}
          rowKey={(r) => r.memberId}
          onRowClick={(r) => toast(`Open ${r.name}`)}
        />
      </Section>

      <Section title="Loading, empty, error, toasts">
        <div className="flex max-w-sm flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-4 w-2/3" rounded="pill" />
          <Skeleton className="h-4 w-1/2" rounded="pill" />
        </div>
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
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast("Saved")}>
            Info toast
          </Button>
          <Button variant="secondary" onClick={() => toast("+80 gold added", "success")}>
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast("Something went wrong — please try again.", "error")}
          >
            Error toast
          </Button>
        </div>
      </Section>
      <Section title="Overlays">
        <OverlayDemos />
      </Section>
      <Toaster />
    </main>
  );
}
