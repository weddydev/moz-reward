"use client";

import { Check, Clock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { RadioGroup } from "@/components/ui/Radio";
import { SidePanel } from "@/components/ui/SidePanel";
import { TextArea } from "@/components/ui/TextField";
import { toast } from "@/components/ui/Toast";
import { REJECT_NOTE_MAX, REJECT_REASONS, type RejectReason } from "@/lib/requests";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { rejectRequestAction } from "./actions";
import { ApproveForm, STALE_CODES, useOnce } from "./ApproveForm";
import { type QueueRow, REJECT_REASON_LABELS } from "./view";

export const QUEUE_EMPTY_TITLE = "No open requests";
export const QUEUE_EMPTY_TEXT =
  "When a customer asks for gold, their request shows here straight away.";

export const REASON_OPTIONS = REJECT_REASONS.map((value) => ({
  value,
  label: REJECT_REASON_LABELS[value],
}));

type Panel = { kind: "approve" | "reject"; row: QueueRow } | null;

/**
 * The team's open points requests (P1-12, PRODUCT §5; minimal approve UI, the full page is P2). Each row: name,
 * member ID, time, visits; Approve (amount spent and items) and Reject (a preset reason and a team-only note) open
 * a side panel from 1024 px and a bottom sheet on phones. An award waiting for the owner shows its proposal; the
 * owner approves it (amount editable) or rejects it, staff see it waiting. The page's realtime stream refreshes
 * the list when a request arrives or is decided elsewhere.
 */
export function RequestsQueue({
  shopId,
  rows,
}: {
  shopId: string;
  rows: readonly QueueRow[];
}): React.JSX.Element {
  const [panel, setPanel] = useState<Panel>(null);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const Overlay = desktop ? SidePanel : BottomSheet;
  const close = (): void => {
    setPanel(null);
  };

  return (
    <>
      {rows.length === 0 ? (
        <Card data-testid="requests-empty">
          <EmptyState title={QUEUE_EMPTY_TITLE} message={QUEUE_EMPTY_TEXT} />
        </Card>
      ) : (
        <ul aria-label="Open requests" className="flex flex-col gap-3" data-testid="requests-list">
          {rows.map((row) => (
            <RequestRow
              key={row.id}
              row={row}
              onApprove={() => {
                setPanel({ kind: "approve", row });
              }}
              onReject={() => {
                setPanel({ kind: "reject", row });
              }}
            />
          ))}
        </ul>
      )}
      <Overlay
        open={panel?.kind === "approve"}
        onClose={close}
        title={
          panel?.row.status === "awaiting_owner" ? "Approve over-limit award" : "Approve visit"
        }
        description={panel ? who(panel.row) : undefined}
      >
        {panel?.kind === "approve" ? (
          <ApproveForm
            key={panel.row.id}
            shopId={shopId}
            row={panel.row}
            pad={!desktop}
            onDone={close}
          />
        ) : null}
      </Overlay>
      <Overlay
        open={panel?.kind === "reject"}
        onClose={close}
        title="Reject request"
        description={panel ? who(panel.row) : undefined}
      >
        {panel?.kind === "reject" ? (
          <RejectForm key={panel.row.id} shopId={shopId} row={panel.row} onDone={close} />
        ) : null}
      </Overlay>
    </>
  );
}

export const who = (row: QueueRow): string =>
  [row.name, row.memberId, `asked at ${row.requestedAt}`].filter(Boolean).join(" · ");

function RequestRow({
  row,
  onApprove,
  onReject,
}: {
  row: QueueRow;
  onApprove: () => void;
  onReject: () => void;
}): React.JSX.Element {
  return (
    <li>
      <Card
        className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
        data-testid="request-row"
        data-request-id={row.id}
        data-status={row.status}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-h3 truncate" data-testid="request-name">
              {row.name}
            </p>
            {row.memberId ? (
              <span className="text-small text-ink-2 font-mono" data-testid="request-member-id">
                {row.memberId}
              </span>
            ) : null}
            {row.status === "awaiting_owner" ? (
              <Badge tone="warning" icon={<Icon icon={Clock} size={14} />}>
                Needs the owner
              </Badge>
            ) : null}
          </div>
          <p className="text-small text-ink-2">
            <time dateTime={row.requestedIso}>{row.requestedAt}</time> · {row.visits}
            {row.lastVisit ? ` · ${row.lastVisit}` : ""}
          </p>
          {row.proposal ? (
            <p className="text-small" data-testid="request-proposal">
              Proposed: {row.proposal.text}
            </p>
          ) : null}
        </div>
        {row.canDecide ? (
          <div className="flex shrink-0 gap-2">
            <Button
              size={46}
              icon={<Icon icon={Check} size={18} />}
              aria-label={`Approve ${row.name}`}
              onClick={onApprove}
            >
              Approve
            </Button>
            <Button
              size={46}
              variant="ghost"
              icon={<Icon icon={X} size={18} />}
              aria-label={`Reject ${row.name}`}
              onClick={onReject}
            >
              Reject
            </Button>
          </div>
        ) : (
          <p className="text-small text-ink-2" data-testid="request-waiting">
            {row.waiting}
          </p>
        )}
      </Card>
    </li>
  );
}

export function RejectForm({
  shopId,
  row,
  onDone,
}: {
  shopId: string;
  row: QueueRow;
  onDone: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const once = useOnce();
  const [reason, setReason] = useState<RejectReason | undefined>();
  const [note, setNote] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const submit = (): Promise<boolean> =>
    once(async () => {
      if (!reason) {
        setReasonError("Choose a reason.");
        return false;
      }
      setPending(true);
      try {
        const trimmed = note.trim();
        const res = await rejectRequestAction({
          shopId,
          requestId: row.id,
          reason,
          note: trimmed === "" ? null : trimmed,
        });
        if (!res.ok) {
          toast(res.error.message, "error");
          if (STALE_CODES.has(res.error.code)) {
            onDone();
            router.refresh();
          }
          return false;
        }
        toast(`Request from ${row.name} rejected.`, "success");
        onDone();
        router.refresh();
        return true;
      } finally {
        setPending(false);
      }
    });

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="reject-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <RadioGroup<RejectReason>
        label="Reason"
        name="reason"
        options={REASON_OPTIONS}
        {...(reason ? { value: reason } : {})}
        onChange={(v) => {
          setReason(v);
          setReasonError(undefined);
        }}
        error={reasonError}
      />
      <TextArea
        label="Note (optional)"
        name="note"
        rows={3}
        maxLength={REJECT_NOTE_MAX}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
        hint="Only your team sees this note."
      />
      <Button
        type="submit"
        variant="destructive"
        block
        loading={pending}
        data-testid="reject-submit"
      >
        Reject request
      </Button>
    </form>
  );
}
