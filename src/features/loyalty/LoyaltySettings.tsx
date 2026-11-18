"use client";

import { History, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { type SyntheticEvent, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { toast } from "@/components/ui/Toast";
import { withNetworkGuard } from "@/features/auth/network";
import { formatDate } from "@/lib/format-date";
import {
  describeEarn,
  type EarnMode,
  LIMITS,
  MILESTONE_PERCENTS,
  type MilestonePercent,
  type MilestoneRule,
  type ProgrammeRules,
  REWARD_NOTICE_DAYS,
  TEMPLATE_IDS,
  TEMPLATES,
  visitsPerIngot,
} from "@/lib/loyalty/programme";
import { useHydrated } from "@/lib/use-hydrated";
import { saveLoyaltyProgramme } from "./actions";
import { IngotPreview } from "./IngotPreview";
import { HISTORY_SHOWN, type LoyaltyView } from "./view";

type MilestoneDraft = { on: boolean; reward: string; isMystery: boolean };
type Draft = {
  earnMode: EarnMode;
  earnRate: string;
  ingotSize: string;
  mainReward: string;
  milestones: Record<MilestonePercent, MilestoneDraft>;
  streakOn: boolean;
  streakBonus: string;
  silver: string;
  gold: string;
  expiryOn: boolean;
  expiryMonths: string;
};

const DEFAULT_STREAK_BONUS = "50";
const DEFAULT_EXPIRY = "12";

function toDraft(r: ProgrammeRules): Draft {
  const ms = Object.fromEntries(
    MILESTONE_PERCENTS.map((p) => {
      const m = r.milestones.find((x) => x.percent === p);
      return [p, { on: Boolean(m), reward: m?.reward ?? "", isMystery: m?.isMystery ?? false }];
    }),
  ) as Record<MilestonePercent, MilestoneDraft>;
  return {
    earnMode: r.earnMode,
    earnRate: String(r.earnRate),
    ingotSize: String(r.ingotSize),
    mainReward: r.mainReward.text,
    milestones: ms,
    streakOn: r.streak !== null,
    streakBonus: r.streak ? String(r.streak.bonusGold) : DEFAULT_STREAK_BONUS,
    silver: String(r.tiers.silver),
    gold: String(r.tiers.gold),
    expiryOn: r.expiryMonths !== null,
    expiryMonths: r.expiryMonths === null ? DEFAULT_EXPIRY : String(r.expiryMonths),
  };
}

/** An empty field is sent as null so the server says "Please enter …" instead of reading it as 0. */
const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

/** What the form sends; `percents[i]` is the milestone percent at index i (to place server errors). */
function toPayload(d: Draft) {
  const percents = MILESTONE_PERCENTS.filter((p) => d.milestones[p].on);
  return {
    percents,
    rules: {
      earnMode: d.earnMode,
      earnRate: num(d.earnRate),
      ingotSize: num(d.ingotSize),
      mainReward: { text: d.mainReward },
      milestones: percents.map((p) => ({
        percent: p,
        reward: d.milestones[p].reward,
        isMystery: d.milestones[p].isMystery,
      })),
      streak: d.streakOn ? { bonusGold: num(d.streakBonus) } : null,
      tiers: { silver: num(d.silver), gold: num(d.gold) },
      expiryMonths: d.expiryOn ? num(d.expiryMonths) : null,
    },
  };
}

/** Server field keys ("rules.milestones.1.reward") → form keys ("milestones.50.reward"). */
function formKey(key: string, percents: readonly MilestonePercent[]): string {
  const k = key.replace(/^rules\./, "");
  const m = /^milestones\.(\d+)\.(.+)$/.exec(k);
  if (!m) return k;
  const percent = percents[Number(m[1])];
  return percent === undefined ? "milestones" : `milestones.${String(percent)}.${m[2] ?? ""}`;
}

const SAMPLE_PERCENT = 60;

export function LoyaltySettings({
  shopId,
  current,
  version,
  savedAt,
  pending,
  history,
  totalVersions,
}: { shopId: string } & LoyaltyView): React.JSX.Element {
  const router = useRouter();
  const hydrated = useHydrated();
  const initial = useMemo(() => toDraft(current ?? TEMPLATES.cafe.rules), [current]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const dirty =
    current === null || JSON.stringify(toPayload(draft)) !== JSON.stringify(toPayload(initial));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const setMilestone = (p: MilestonePercent, patch: Partial<MilestoneDraft>): void => {
    setDraft((d) => ({
      ...d,
      milestones: { ...d.milestones, [p]: { ...d.milestones[p], ...patch } },
    }));
  };

  async function save(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setErrors({});
    setFormError(null);
    const { percents, rules } = toPayload(draft);
    const res = await withNetworkGuard(() =>
      // Numbers left empty are null here; the server's strict schema refuses them with a field message.
      saveLoyaltyProgramme({ shopId, baseVersion: version, rules: rules as ProgrammeRules }),
    );
    inFlight.current = false;
    setSaving(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    if (!res.value.ok) {
      const { error } = res.value;
      const next: Record<string, string> = {};
      for (const [key, messages] of Object.entries(error.fieldErrors ?? {})) {
        if (messages[0]) next[formKey(key, percents)] = messages[0];
      }
      setErrors(next);
      setFormError(error.message);
      return;
    }
    const data = res.value.data;
    if (data.kind === "unchanged") {
      toast("No changes to save.");
      return;
    }
    toast(
      data.rewardsFrom !== data.activeFrom
        ? `Saved. Members get ${String(REWARD_NOTICE_DAYS)} days' notice: the new rewards apply from ${formatDate(new Date(data.rewardsFrom))}.`
        : "Saved. The changes apply now.",
      "success",
    );
    router.refresh();
  }

  const preview = toPayload(draft).rules;
  const previewMilestones: MilestoneRule[] = preview.milestones.map((m) => ({
    ...m,
    reward: m.reward.trim() === "" ? "Milestone reward" : m.reward,
  }));
  const rate = Number(draft.earnRate);
  const size = Number(draft.ingotSize);
  const visits =
    rate > 0 && size > 0
      ? visitsPerIngot({ earnMode: draft.earnMode, earnRate: rate, ingotSize: size })
      : null;
  const rateLimits = LIMITS.earnRate[draft.earnMode];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Loyalty programme</h1>
        <p className="text-small text-ink-2">
          {savedAt
            ? `Version ${String(version)} · saved ${formatDate(new Date(savedAt))}`
            : "Not set up yet. Pick a template to start, then adjust it."}
        </p>
      </header>

      {pending.map((p) => (
        <div
          key={p.version}
          role="status"
          className="bg-warning-tint text-ink flex items-start gap-3 rounded-md px-4 py-3"
        >
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
          <p className="text-small">
            New rewards from version {p.version} apply to members from{" "}
            <strong>{formatDate(new Date(p.rewardsFrom))}</strong> ({REWARD_NOTICE_DAYS} days&apos;
            notice). Until then members keep the current rewards.
          </p>
        </div>
      ))}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <form onSubmit={(e) => void save(e)} noValidate className="flex min-w-0 flex-col gap-6">
          {/* Disabled until hydrated (C-20): typing into the server HTML would be wiped by hydration. */}
          <fieldset disabled={!hydrated} className="contents">
            <Card className="flex flex-col gap-3 p-4 md:p-6">
              <h2 className="text-h3">Start from a template</h2>
              <p className="text-small text-ink-2">
                Fills the form with sensible defaults. Nothing changes until you save.
              </p>
              <ChipGroup label="Templates">
                {TEMPLATE_IDS.map((t) => (
                  <Chip
                    key={t}
                    selected={false}
                    onToggle={() => {
                      setDraft(toDraft(TEMPLATES[t].rules));
                      setErrors({});
                    }}
                  >
                    {TEMPLATES[t].name}
                  </Chip>
                ))}
              </ChipGroup>
            </Card>

            <Card className="flex flex-col gap-4 p-4 md:p-6">
              <h2 className="text-h3">Earning</h2>
              <SegmentedControl
                label="How members earn gold"
                options={[
                  { value: "per_visit", label: "Per visit" },
                  { value: "per_pound", label: "Per £1 spent" },
                ]}
                value={draft.earnMode}
                onChange={(v) => {
                  set("earnMode", v);
                }}
              />
              <TextField
                label={
                  draft.earnMode === "per_visit" ? "Gold per approved visit" : "Gold per £1 spent"
                }
                hint={
                  draft.earnMode === "per_pound"
                    ? `Whole pounds only, rounded down. ${String(rateLimits.min)}–${String(rateLimits.max)}.`
                    : `${String(rateLimits.min)}–${String(rateLimits.max)}.`
                }
                inputMode="numeric"
                value={draft.earnRate}
                onChange={(e) => {
                  set("earnRate", e.target.value);
                }}
                error={errors["earnRate"]}
              />
              <TextField
                label="Gold to fill one ingot"
                hint={
                  visits
                    ? `About ${String(visits)} visits. A change applies from each member's next ingot.`
                    : "A change applies from each member's next ingot."
                }
                inputMode="numeric"
                value={draft.ingotSize}
                onChange={(e) => {
                  set("ingotSize", e.target.value);
                }}
                error={errors["ingotSize"]}
              />
            </Card>

            <Card className="flex flex-col gap-4 p-4 md:p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-h3">Rewards</h2>
                <p className="text-small text-ink-2">
                  Members get {REWARD_NOTICE_DAYS} days&apos; notice before a change to rewards or
                  milestones applies. A member&apos;s current ingot keeps the rewards it started
                  with.
                </p>
              </div>
              <TextField
                label="Main reward (when the ingot is full)"
                maxLength={LIMITS.rewardText.max}
                value={draft.mainReward}
                onChange={(e) => {
                  set("mainReward", e.target.value);
                }}
                error={errors["mainReward.text"]}
              />
              <fieldset className="flex flex-col gap-4">
                <legend className="text-body mb-1 font-semibold">Milestones</legend>
                <p className="text-small text-ink-2 -mt-2">
                  Up to three, repeated in every ingot (default — client to confirm). A mystery
                  reward shows “?” until the member reaches it.
                </p>
                {MILESTONE_PERCENTS.map((p) => {
                  const m = draft.milestones[p];
                  return (
                    <div key={p} className="border-line flex flex-col gap-3 border-t pt-3">
                      <Switch
                        label={`Milestone at ${String(p)}%`}
                        checked={m.on}
                        onCheckedChange={(on) => {
                          setMilestone(p, { on });
                        }}
                      />
                      {m.on ? (
                        <>
                          <TextField
                            label={`Reward at ${String(p)}%`}
                            maxLength={LIMITS.rewardText.max}
                            value={m.reward}
                            onChange={(e) => {
                              setMilestone(p, { reward: e.target.value });
                            }}
                            error={errors[`milestones.${String(p)}.reward`]}
                          />
                          <Checkbox
                            label="Mystery reward"
                            description="Shown as “?” until reached."
                            checked={m.isMystery}
                            onCheckedChange={(isMystery) => {
                              setMilestone(p, { isMystery });
                            }}
                          />
                        </>
                      ) : null}
                    </div>
                  );
                })}
                {errors["milestones"] ? (
                  <p className="text-small text-danger">{errors["milestones"]}</p>
                ) : null}
              </fieldset>
            </Card>

            <Card className="flex flex-col gap-4 p-4 md:p-6">
              <h2 className="text-h3">Streak, tiers and expiry</h2>
              <Switch
                label="Weekly streak bonus"
                description="Bonus gold on the first visit of each week that extends a streak of 2 or more weeks in a row (Mon–Sun, UK time). Default — client to confirm."
                checked={draft.streakOn}
                onCheckedChange={(on) => {
                  set("streakOn", on);
                }}
              />
              {draft.streakOn ? (
                <TextField
                  label="Streak bonus (gold)"
                  hint={`${String(LIMITS.streakBonus.min)}–${String(LIMITS.streakBonus.max)}.`}
                  inputMode="numeric"
                  value={draft.streakBonus}
                  onChange={(e) => {
                    set("streakBonus", e.target.value);
                  }}
                  error={errors["streak.bonusGold"]}
                />
              ) : null}
              <div className="border-line flex flex-col gap-1 border-t pt-4">
                <p className="text-body font-semibold">Tiers</p>
                <p className="text-small text-ink-2">
                  Bronze from the start. A status label only, based on ingots filled; it never goes
                  down. Default — client to confirm.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Silver after (ingots)"
                  inputMode="numeric"
                  value={draft.silver}
                  onChange={(e) => {
                    set("silver", e.target.value);
                  }}
                  error={errors["tiers.silver"]}
                />
                <TextField
                  label="Gold after (ingots)"
                  inputMode="numeric"
                  value={draft.gold}
                  onChange={(e) => {
                    set("gold", e.target.value);
                  }}
                  error={errors["tiers.gold"]}
                />
              </div>
              <div className="border-line border-t pt-4">
                <Switch
                  label="Gold expires"
                  description="Counted from the member's last approved visit. Removes only the current ingot's gold, with warnings 30 and 7 days before."
                  checked={draft.expiryOn}
                  onCheckedChange={(on) => {
                    set("expiryOn", on);
                  }}
                />
              </div>
              {draft.expiryOn ? (
                <TextField
                  label="Expires after (months)"
                  hint={`At least ${String(LIMITS.expiryMonths.min)} months.`}
                  inputMode="numeric"
                  value={draft.expiryMonths}
                  onChange={(e) => {
                    set("expiryMonths", e.target.value);
                  }}
                  error={errors["expiryMonths"]}
                />
              ) : null}
            </Card>

            <div className="flex flex-col gap-3">
              {formError ? (
                <p role="alert" className="text-small text-danger">
                  {formError}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={saving} disabled={!dirty || saving}>
                  {current ? "Save changes" : "Set up programme"}
                </Button>
                {current && dirty ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDraft(initial);
                      setErrors({});
                      setFormError(null);
                    }}
                  >
                    Discard changes
                  </Button>
                ) : null}
              </div>
            </div>
          </fieldset>
        </form>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
          <Card className="flex flex-col items-center gap-3 p-4 text-center md:p-6">
            <h2 className="text-h3 self-start">Preview</h2>
            <IngotPreview percent={SAMPLE_PERCENT} milestones={previewMilestones} />
            <p className="text-small text-ink-2">A member {SAMPLE_PERCENT}% of the way to:</p>
            <p className="text-body font-semibold [overflow-wrap:anywhere]">
              {draft.mainReward.trim() || "Main reward"}
            </p>
            {rate > 0 ? (
              <p className="text-small text-ink-2">
                {describeEarn({ earnMode: draft.earnMode, earnRate: rate })}
                {size > 0 ? ` · ${size.toLocaleString("en-GB")} gold per ingot` : ""}
              </p>
            ) : null}
            {previewMilestones.length > 0 ? (
              <ul className="flex w-full flex-col gap-1 text-left">
                {previewMilestones.map((m) => (
                  <li key={m.percent} className="text-small flex gap-2">
                    <span className="text-ink-2 w-10 shrink-0">{m.percent}%</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {m.isMystery ? "? (mystery)" : m.reward}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-3 p-4 md:p-6">
            <h2 className="text-h3 flex items-center gap-2">
              <History aria-hidden="true" className="size-5" strokeWidth={1.5} />
              Version history
            </h2>
            {history.length === 0 ? (
              <p className="text-small text-ink-2">No versions yet.</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {history.map((h) => (
                  <li
                    key={h.version}
                    className="border-line flex flex-col gap-1 border-t pt-3 first:border-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-small font-semibold">Version {h.version}</span>
                      {h.version === version ? <Badge tone="neutral">Current</Badge> : null}
                      <span className="text-caption text-ink-2">
                        {formatDate(new Date(h.savedAt))}
                      </span>
                    </div>
                    {h.rewardsFrom ? (
                      <p className="text-caption text-ink-2">
                        Rewards apply from {formatDate(new Date(h.rewardsFrom))}
                      </p>
                    ) : null}
                    <ul className="text-small text-ink-2 flex flex-col gap-0.5 [overflow-wrap:anywhere]">
                      {h.changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            {totalVersions > HISTORY_SHOWN ? (
              <p className="text-caption text-ink-2">
                Showing the latest {HISTORY_SHOWN} of {totalVersions} versions.
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}
