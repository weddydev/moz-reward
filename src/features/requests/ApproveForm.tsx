"use client";

import { Delete, Flame, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { toast } from "@/components/ui/Toast";
import { cx } from "@/lib/cx";
import type { StreakState } from "@/lib/loyalty/engine";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import type { ActionResult } from "@/server/actionTemplate";
import type { ScanAwardResult } from "@/server/services/scan-awards";
import { approveRequestAction, ownerApproveAction } from "./actions";
import {
  type GoldPreview,
  mergeItems,
  PAD_KEYS,
  type PadKey,
  padPress,
  type PickState,
  previewGold,
  type QuickPick,
  togglePick,
} from "./approve-pad";
import { parseItems, parsePounds, type QueueRow } from "./view";

/** A decision the queue no longer allows (decided by someone else, expired, left): the page refreshes. */
export const STALE_CODES = new Set(["CONFLICT", "NOT_FOUND", "FORBIDDEN"]);

/** What the live gold preview needs from the page (P2-02); without it the form shows no preview. */
export type PreviewInputs = {
  versions: readonly ProgrammeVersion[];
  quickPicks: readonly QuickPick[];
  cap: { pence: number; gold: number };
  limit: number | null;
};

/** A scan award's submit (P2-02): the scanner sends the member, its idempotency key, and this form's amount and items. */
export type AwardSubmit = (input: {
  amountPence: number | null;
  items: string[];
}) => Promise<ActionResult<ScanAwardResult>>;

/** One decision at a time: a second press while the first is on its way does nothing (the server refuses a repeat). */
export function useOnce(): (work: () => Promise<boolean>) => Promise<boolean> {
  const busy = useRef(false);
  return async (work) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      return await work();
    } finally {
      busy.current = false;
    }
  };
}

/** What the amount box accepts while typing (the pad's own rules, `padPress`, for taps). */
const TYPING = /^\d{0,6}(\.\d{0,2})?$/;
const PAD_LABEL: Readonly<Record<PadKey, string>> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  ".": "Decimal point",
  "0": "0",
  back: "Delete",
};

const goldText = (n: number): string => `+${n.toLocaleString("en-GB")} gold`;

function previewNote(p: GoldPreview): string {
  switch (p.kind) {
    case "gold":
      return p.toOwner
        ? "Over your limit for one award: the owner will approve it."
        : p.streakBonus > 0
          ? `Includes ${goldText(p.streakBonus)} streak bonus.`
          : "Worked out from your loyalty programme.";
    case "needs-amount":
      return "Enter the amount spent. This shop gives gold per £1.";
    case "no-gold":
      return "That amount doesn't earn any gold yet.";
    case "over-cap":
      return "That's over the limit for one award. Split it or ask support.";
    case "no-programme":
      return "Set up your loyalty programme before awarding gold.";
    default: {
      const never: never = p;
      return String(never);
    }
  }
}

/**
 * Approve a request (P1-12; P2-02 full form, PRODUCT §5, DESIGN §15 screen 18): amount spent, the shop's item
 * quick-picks (their prices fill the amount until it is typed by hand), items, and the gold it will add from the
 * loyalty engine. On a phone (`pad`) the amount comes from a large number pad; the box stays a text field
 * without the system keyboard (`inputMode="none"`), so a hardware keyboard and assistive tech still type in it.
 * An award waiting for the owner shows its proposal; the owner may change the amount. The server prices and
 * guards the award again; the preview is a guide. With `award` (the member scanner, P2-02) the same form awards a
 * scanned member directly: a request is created and decided in one step on the server.
 */
export function ApproveForm({
  shopId,
  row,
  streak,
  preview,
  pad,
  onDone,
  award,
  onOpenRequest,
}: {
  shopId: string;
  row: QueueRow;
  streak?: StreakState;
  preview?: PreviewInputs;
  pad: boolean;
  onDone: () => void;
  award?: AwardSubmit;
  /** A scan award found the member's waiting request instead (one open request per member). */
  onOpenRequest?: (requestId: string) => void;
}): React.JSX.Element {
  const router = useRouter();
  const once = useOnce();
  const picks = preview?.quickPicks ?? [];
  const [pick, setPick] = useState<PickState>(() => ({
    picked: [],
    amount: row.proposal?.amountPence == null ? "" : (row.proposal.amountPence / 100).toFixed(2),
    typed: row.proposal?.amountPence != null,
  }));
  const [items, setItems] = useState(row.proposal?.items.join(", ") ?? "");
  const [amountError, setAmountError] = useState<string | undefined>();
  const [itemsError, setItemsError] = useState<string | undefined>();
  const [tries, setTries] = useState(0);
  const [pending, setPending] = useState(false);

  const setAmount = (amount: string): void => {
    setPick((s) => ({ ...s, amount, typed: amount !== "" }));
    setAmountError(undefined);
  };

  const pounds = parsePounds(pick.amount);
  const gold: GoldPreview | null =
    preview && streak && pounds.ok
      ? previewGold(
          {
            versions: preview.versions,
            requestedAt: new Date(row.requestedIso),
            streak,
            cap: preview.cap,
            limit: row.status === "awaiting_owner" ? null : preview.limit,
          },
          pounds.pence,
        )
      : null;

  const submit = (): Promise<boolean> =>
    once(async () => {
      const list = parseItems(items);
      const missing = pounds.ok && pounds.pence === null && row.amountRequired;
      setAmountError(
        !pounds.ok
          ? pounds.message
          : missing
            ? "Enter the amount spent. This shop gives gold per £1."
            : undefined,
      );
      setItemsError(list.ok ? undefined : list.message);
      if (!pounds.ok || !list.ok || missing) {
        setTries((n) => n + 1);
        return false;
      }
      const all = mergeItems(pick.picked, list.items);
      const again = parseItems(all.join(","));
      if (!again.ok) {
        setItemsError(again.message);
        setTries((n) => n + 1);
        return false;
      }
      setPending(true);
      try {
        const input = { shopId, requestId: row.id, amountPence: pounds.pence, items: all };
        const res: ActionResult<ScanAwardResult> = award
          ? await award({ amountPence: pounds.pence, items: all })
          : row.status === "awaiting_owner"
            ? await ownerApproveAction(input)
            : await approveRequestAction(input);
        if (!res.ok) {
          const field = res.error.fieldErrors?.["amountPence"]?.[0];
          if (field) {
            setAmountError(field);
            setTries((n) => n + 1);
          } else {
            toast(res.error.message, "error");
          }
          if (STALE_CODES.has(res.error.code)) {
            onDone();
            router.refresh();
          }
          return false;
        }
        const d = res.data;
        if (d.outcome === "open_request") {
          onOpenRequest?.(d.requestId);
          return false;
        }
        toast(
          d.outcome === "approved"
            ? `Approved: ${goldText(d.gold)} for ${row.name}. Receipt ${d.receiptNumber.toLocaleString("en-GB")}.`
            : d.outcome === "awaiting_owner"
              ? `${goldText(d.gold)} is over your limit, so the owner will approve it.`
              : `That award for ${row.name} was already recorded.`,
          "success",
        );
        onDone();
        router.refresh();
        return true;
      } finally {
        setPending(false);
      }
    });

  const label =
    gold?.kind === "gold" && !gold.toOwner
      ? `Confirm and issue ${goldText(gold.gold)}`
      : gold?.kind === "gold"
        ? "Send to the owner"
        : row.status === "awaiting_owner"
          ? "Approve award"
          : "Approve and award gold";

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="approve-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-small text-ink-2" data-testid="approve-member">
        {row.visits}
        {row.lastVisit ? ` · ${row.lastVisit}` : ""}
      </p>
      {row.proposal ? (
        <p className="text-body" data-testid="approve-proposal">
          Your team proposed {row.proposal.text}. You can change the amount.
        </p>
      ) : null}
      <TextField
        label="Amount spent (£)"
        name="amount"
        inputMode={pad ? "none" : "decimal"}
        autoComplete="off"
        placeholder={pad ? "0" : "12.50"}
        value={pick.amount}
        onChange={(e) => {
          const v = e.target.value.trim().replace(/^£\s*/, "");
          if (TYPING.test(v)) setAmount(v);
        }}
        hint={
          row.amountRequired
            ? "Required: this shop gives gold per £1."
            : "Optional for a visit-based programme."
        }
        error={amountError}
        errorKey={tries}
        required={row.amountRequired}
      />
      {pad ? (
        <div
          role="group"
          aria-label="Number pad"
          className="grid grid-cols-3 gap-2"
          data-testid="approve-pad"
        >
          {PAD_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={PAD_LABEL[k]}
              onClick={() => {
                setAmount(padPress(pick.amount, k));
              }}
              className="pressable border-line bg-surface text-h2 tabular flex h-12 items-center justify-center rounded-md border font-semibold"
            >
              {k === "back" ? <Icon icon={Delete} size={24} /> : k === "." ? "." : k}
            </button>
          ))}
        </div>
      ) : null}
      {picks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-small font-semibold">
            Quick pick <span className="text-ink-2 font-normal">(optional)</span>
          </p>
          <ChipGroup label="Quick picks">
            {picks.map((p) => (
              <Chip
                key={p.label}
                selected={pick.picked.includes(p.label)}
                onToggle={() => {
                  setPick((s) => togglePick(s, p, picks));
                  setAmountError(undefined);
                }}
              >
                {p.pricePence === null ? p.label : `${p.label} £${(p.pricePence / 100).toFixed(2)}`}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      ) : null}
      <TextField
        label="Items (optional)"
        name="items"
        autoComplete="off"
        placeholder="Flat white, Croissant"
        value={items}
        onChange={(e) => {
          setItems(e.target.value);
        }}
        hint="Separate items with commas. They show on the receipt."
        error={itemsError}
        errorKey={tries}
      />
      {gold ? (
        <div
          className={cx(
            "flex items-center justify-between gap-3 rounded-md border px-4 py-3",
            gold.kind === "gold" ? "border-gold bg-champagne" : "border-line bg-surface",
          )}
          data-testid="approve-gold"
          data-kind={gold.kind}
          aria-live="polite"
        >
          <div className="flex min-w-0 flex-col">
            <p className="text-small flex items-center gap-1.5 font-semibold">
              <Icon
                icon={gold.kind === "gold" && gold.streakBonus > 0 ? Flame : Sparkles}
                size={16}
              />
              Calculated gold
            </p>
            <p className="text-small text-ink-2">{previewNote(gold)}</p>
          </div>
          {gold.kind === "gold" ? (
            <p className="text-h2 tabular text-gold-deep shrink-0" data-testid="approve-gold-value">
              {goldText(gold.gold)}
            </p>
          ) : null}
        </div>
      ) : null}
      {/* On a phone the pad is tall: the confirm button stays in reach at the foot of the sheet. */}
      <div className={pad ? "bg-surface sticky bottom-0 pt-2 pb-1" : undefined}>
        <Button type="submit" block loading={pending} data-testid="approve-submit">
          {label}
        </Button>
      </div>
    </form>
  );
}
