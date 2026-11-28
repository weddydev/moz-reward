"use client";

import { Check, Clock, ScanLine, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { SidePanel } from "@/components/ui/SidePanel";
import { type Column, Table } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { play } from "@/lib/sound";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { ApproveForm, type PreviewInputs } from "./ApproveForm";
import { RejectForm, who } from "./RequestsQueue";
import { REQUEST_TABS, type RequestTab, TAB_LABELS } from "./tabs";
import type { BoardRow } from "./view";
import "./requests.css";

const EMPTY: Readonly<Record<RequestTab, { title: string; message: string }>> = {
  pending: {
    title: "No open requests",
    message: "When a customer asks for gold, their request shows here straight away.",
  },
  awaiting: {
    title: "Nothing waiting for the owner",
    message: "Awards above a team member's limit wait here for the owner.",
  },
  approved: {
    title: "No approvals yet today",
    message: "Visits approved today show here, newest first.",
  },
  expired: {
    title: "No expired requests",
    message: "A request nobody decides within 24 hours expires and shows here.",
  },
};

type Panel = { kind: "approve" | "reject"; row: BoardRow } | null;

/**
 * Request ids that arrived while the page was open (DESIGN §8.7): a row that wasn't on the first page of this
 * tab before a realtime refresh. Never on the first render, a tab switch or an older page, so only live
 * arrivals slide in (with the soft `tick` when the dashboard tab has focus and sounds are on).
 */
function useArrivals(rows: readonly BoardRow[], key: string, live: boolean): ReadonlySet<string> {
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.id));
    const before = seen.current;
    seen.current = { key, ids };
    if (!before || before.key !== key || !live) {
      setArrived(new Set());
      return;
    }
    const fresh = rows.filter((r) => !before.ids.has(r.id)).map((r) => r.id);
    setArrived(new Set(fresh));
    if (fresh.length > 0 && document.hasFocus()) play("tick");
  }, [rows, key, live]);
  return arrived;
}

function StatusBadge({ row }: { row: BoardRow }): React.JSX.Element {
  if (row.outcome === "Expired" || row.status === "expired") return <Badge>Expired</Badge>;
  if (row.status === "approved") {
    return (
      <Badge tone="open" icon={<Icon icon={Check} size={14} />}>
        Approved
      </Badge>
    );
  }
  if (row.status === "awaiting_owner") {
    return (
      <Badge tone="warning" icon={<Icon icon={Clock} size={14} />}>
        Needs the owner
      </Badge>
    );
  }
  return (
    <Badge tone="happy-hour" icon={<Icon icon={Clock} size={14} />}>
      {row.source === "scan" ? "Scanned" : "Pending"}
    </Badge>
  );
}

function Actions({
  row,
  onApprove,
  onReject,
}: {
  row: BoardRow;
  onApprove: () => void;
  onReject: () => void;
}): React.JSX.Element {
  if (row.canDecide) {
    return (
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
    );
  }
  return (
    <p
      className="text-small text-ink-2"
      data-testid={row.waiting ? "request-waiting" : "request-outcome"}
    >
      {row.waiting ?? row.outcome ?? "—"}
    </p>
  );
}

/**
 * The Requests page (P2-02, PRODUCT §14, DESIGN §15 screen 18). Tabs change the URL (`?tab=`), so a refresh, a
 * shared link and the browser's back button all keep the tab; the server reads the page. From 1024 px the
 * requests are a table with an approve side panel; on phones they are cards and Approve opens a sheet with a
 * number pad. Older requests come a page at a time ("Show older"). Every control is a native button or link, so
 * the whole flow runs from the keyboard.
 */
export function RequestsBoard({
  shopId,
  tab,
  counts,
  rows,
  older,
  paged,
  preview,
}: {
  shopId: string;
  tab: RequestTab;
  counts: { pending: number; awaiting: number; approved: number };
  rows: readonly BoardRow[];
  /** The cursor for the next (older) page, or null on the last page. */
  older: string | null;
  /** True when this is an older page (no live arrivals there). */
  paged: boolean;
  preview: PreviewInputs;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [switching, startSwitch] = useTransition();
  // The pill moves on the click; the page follows when the server answers (a new `tab` resets it).
  const [shown, setShown] = useState<RequestTab>(tab);
  const [lastTab, setLastTab] = useState<RequestTab>(tab);
  if (lastTab !== tab) {
    setLastTab(tab);
    setShown(tab);
  }
  const [panel, setPanel] = useState<Panel>(null);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const Overlay = desktop ? SidePanel : BottomSheet;
  const arrived = useArrivals(rows, tab, !paged && (tab === "pending" || tab === "awaiting"));
  const close = (): void => {
    setPanel(null);
  };

  const href = (t: RequestTab, before?: string): string => {
    const q = new URLSearchParams();
    if (t !== "pending") q.set("tab", t);
    if (before) q.set("before", before);
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const items = REQUEST_TABS.map((value) => ({
    value,
    label: TAB_LABELS[value],
    ...(value === "expired" ? {} : { count: counts[value] }),
  }));

  const approve = (row: BoardRow) => () => {
    setPanel({ kind: "approve", row });
  };
  const reject = (row: BoardRow) => () => {
    setPanel({ kind: "reject", row });
  };

  const columns: ReadonlyArray<Column<BoardRow>> = [
    {
      key: "customer",
      header: "Customer",
      width: "30%",
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold" data-testid="request-name">
            {r.name}
          </span>
          {r.proposal ? (
            <span className="text-small truncate" data-testid="request-proposal">
              Proposed: {r.proposal.text}
            </span>
          ) : (
            <span className="text-small text-ink-2 truncate">
              {r.visits}
              {r.lastVisit ? ` · ${r.lastVisit}` : ""}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "member",
      header: "Member ID",
      width: "8rem",
      cell: (r) =>
        r.memberId ? (
          <span className="font-mono" data-testid="request-member-id">
            {r.memberId}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "at",
      header: "Requested at",
      width: "9rem",
      cell: (r) => <time dateTime={r.requestedIso}>{r.requestedAt}</time>,
    },
    { key: "status", header: "Status", width: "10rem", cell: (r) => <StatusBadge row={r} /> },
    {
      key: "action",
      header: "Action",
      width: "15rem",
      cell: (r) => <Actions row={r} onApprove={approve(r)} onReject={reject(r)} />,
    },
  ];

  const empty = <EmptyState title={EMPTY[tab].title} message={EMPTY[tab].message} />;

  return (
    <>
      {/* Phones and tablets: from lg the shell's header carries Scan. The wrapper hides it (KI-91). */}
      <div className="lg:hidden">
        <Link
          href="/dashboard/scan"
          className={buttonClasses({ block: true, className: "sm:w-auto" })}
          data-testid="requests-scan"
        >
          <Icon icon={ScanLine} />
          Scan member QR
        </Link>
      </div>
      <Tabs
        label="Requests"
        items={items}
        value={shown}
        onChange={(v) => {
          setShown(v);
          startSwitch(() => {
            router.push(href(v), { scroll: false });
          });
        }}
      >
        <div
          className="flex flex-col gap-3 transition-opacity"
          style={{ opacity: switching ? 0.6 : 1 }}
          aria-busy={switching}
          data-testid="requests-board"
          data-tab={tab}
        >
          {rows.length === 0 ? (
            <Card data-testid="requests-empty">{empty}</Card>
          ) : desktop ? (
            <div data-testid="requests-list">
              <Table
                caption={`${TAB_LABELS[tab]} requests`}
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                rowAttrs={(r) => ({
                  "data-testid": "request-row",
                  "data-request-id": r.id,
                  "data-status": r.status,
                  "data-arrived": arrived.has(r.id) ? "" : undefined,
                })}
                empty={empty}
              />
            </div>
          ) : (
            <ul
              aria-label={`${TAB_LABELS[tab]} requests`}
              className="flex flex-col gap-3"
              data-testid="requests-list"
            >
              {rows.map((r) => (
                <li
                  key={r.id}
                  data-testid="request-row"
                  data-request-id={r.id}
                  data-status={r.status}
                  data-arrived={arrived.has(r.id) ? "" : undefined}
                  className="rounded-[24px]"
                >
                  <Card className="flex flex-col gap-3 p-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-h3 truncate" data-testid="request-name">
                          {r.name}
                        </p>
                        {r.memberId ? (
                          <span
                            className="text-small text-ink-2 font-mono"
                            data-testid="request-member-id"
                          >
                            {r.memberId}
                          </span>
                        ) : null}
                        <StatusBadge row={r} />
                      </div>
                      <p className="text-small text-ink-2">
                        <time dateTime={r.requestedIso}>{r.requestedAt}</time> · {r.visits}
                        {r.lastVisit ? ` · ${r.lastVisit}` : ""}
                      </p>
                      {r.proposal ? (
                        <p className="text-small" data-testid="request-proposal">
                          Proposed: {r.proposal.text}
                        </p>
                      ) : null}
                    </div>
                    <Actions row={r} onApprove={approve(r)} onReject={reject(r)} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {older || paged ? (
            <nav aria-label="Pages" className="flex flex-wrap justify-between gap-2">
              {paged ? (
                <Link href={href(tab)} className="text-small font-semibold underline">
                  Back to the newest
                </Link>
              ) : (
                <span />
              )}
              {older ? (
                <Link
                  href={href(tab, older)}
                  className="text-small font-semibold underline"
                  data-testid="requests-older"
                >
                  Show older requests
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </Tabs>
      <Overlay
        open={panel?.kind === "approve"}
        onClose={close}
        title={
          panel?.row.status === "awaiting_owner" ? "Approve over-limit award" : "Process request"
        }
        description={panel ? who(panel.row) : undefined}
      >
        {panel?.kind === "approve" ? (
          <ApproveForm
            key={panel.row.id}
            shopId={shopId}
            row={panel.row}
            streak={panel.row.streak}
            preview={preview}
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
